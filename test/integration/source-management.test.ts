// T010 (feature 006): serviço de gestão de fontes com PostgreSQL real (D-03, D-04, D-06, D-19).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOperator, type SeedResult } from "../../src/main/seed-data.js";
import {
  consentStatement,
  createCaptureAdmin,
  createEnsureImportSource,
  createPgAuditLog,
  createPgCaptureRepository,
  createPgGroupDirectory,
  createPgImportSourceRepository,
  createPgSpaceSourceRepository,
  createSourceManagement,
  type SourceManagement,
} from "../../src/modules/sources/index.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";
import { one } from "../support/rows.js";

let db: TestDatabase;
let management: SourceManagement;
let me: { userId: string; spaceId: string };
let other: SeedResult;

const G = (n: number) => `12036300000000010${n}@g.us`;
const NOW = new Date("2026-11-24T20:00:00Z");

beforeAll(async () => {
  db = await startTestDatabase();
  const seed = await seedOperator(db.pool, { conversationId: "conversa-fake", conversationTitle: "Conversa do canal de teste" });
  me = { userId: seed.userId, spaceId: seed.spaceId };
  other = await seedOperator(db.pool, { accountId: "outro", displayName: "Outro", conversationId: "do-outro", conversationTitle: "Do outro" });
  await db.pool.query(
    `INSERT INTO whatsapp_groups (group_id, subject, participants, left_at) VALUES
       ($1, 'Projeto X', 5, NULL), ($2, 'Família', 8, NULL), ($3, 'Do vizinho', 4, NULL), ($4, 'Grupo antigo', 2, now())`,
    [G(1), G(2), G(3), G(4)],
  );
  await createEnsureImportSource(createPgImportSourceRepository(db.pool))(me, "Projeto X");
  await createEnsureImportSource(createPgImportSourceRepository(db.pool))(me, "T3");
  const captures = createPgCaptureRepository(db.pool);
  const directory = createPgGroupDirectory(db.pool);
  const admin = createCaptureAdmin({ directory, captures, sources: createPgImportSourceRepository(db.pool) });
  // "Do vizinho" é acompanhado por outro espaço (D-19).
  await admin.authorize({ owner: { userId: other.userId, spaceId: other.spaceId }, group: G(3), consent: "todos avisados e de acordo" });
  management = createSourceManagement({ directory, captures, admin, spaceSources: createPgSpaceSourceRepository(db.pool), audit: createPgAuditLog(db.pool), now: () => NOW });
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

const states = async () => Object.fromEntries((await management.list(me)).map((i) => [i.title, i.state]));
const refOf = async (title: string) => {
  const found = (await management.list(me)).find((i) => i.title === title);
  if (!found) throw new Error(`sem ${title}`);
  return found.ref;
};

describe("gestão de fontes (feature 006)", () => {
  it("D-04: lista grupos do número de captura e conversas do espaço, em ordem, sem grupo de que o número saiu", async () => {
    const items = await management.list(me);
    expect(items.map((i) => [i.title, i.state])).toEqual([
      ["Conversa do canal de teste", "conversation"],
      ["Do vizinho", "other_account"],
      ["Família", "not_following"],
      ["Projeto X", "not_following"],
      ["Projeto X", "imported"],
      ["T3", "imported"],
    ]);
    expect(items.find((i) => i.title === "Família")?.ref).toBe(`group:${G(2)}`);
  });

  it("D-06: acompanhar liga o grupo à importação de mesmo nome e grava a declaração e a auditoria", async () => {
    const ref = `group:${G(1)}`;
    expect(await management.checkFollow(me, ref)).toEqual({ kind: "ok", title: "Projeto X", linksImport: true });
    expect(await management.follow(me, ref, "whatsapp")).toMatchObject({ kind: "ok" });
    const items = await management.list(me);
    expect(items.filter((i) => i.title === "Projeto X")).toEqual([{ ref, title: "Projeto X", state: "following" }]);
    const capture = one((await db.pool.query<{ consent_statement: string; conv: string }>(
      "SELECT c.consent_statement, s.external_conversation_id AS conv FROM source_captures c JOIN sources s ON s.id = c.source_id WHERE c.group_id = $1",
      [G(1)],
    )).rows);
    expect(capture).toEqual({ consent_statement: consentStatement(NOW), conv: "export:projeto-x" });
    expect(await management.checkFollow(me, ref)).toMatchObject({ kind: "already_following", title: "Projeto X" });
    expect(one((await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_events WHERE action = 'capture.authorized'")).rows).n).toBe(1);
  });

  it("parar mantém a ligação; voltar a acompanhar usa a mesma fonte", async () => {
    const ref = `group:${G(1)}`;
    expect(await management.stop(me, ref, "whatsapp")).toEqual({ kind: "stopped", title: "Projeto X" });
    expect((await states())["Projeto X"]).toBe("stopped");
    expect(await management.stop(me, ref, "whatsapp")).toEqual({ kind: "not_following", title: "Projeto X" });
    expect(await management.checkFollow(me, ref)).toEqual({ kind: "ok", title: "Projeto X", linksImport: false });
    await management.follow(me, ref, "whatsapp");
    const { rows } = await db.pool.query<{ n: number }>("SELECT count(DISTINCT source_id)::int AS n FROM source_captures WHERE group_id = $1", [G(1)]);
    expect(one(rows).n).toBe(1);
    await management.stop(me, ref, "whatsapp");
  });

  it("D-19: grupo de outra conta não aceita comandos; conversa importada não é acompanhável", async () => {
    const neighbour = `group:${G(3)}`;
    expect(await management.checkFollow(me, neighbour)).toEqual({ kind: "other_account", title: "Do vizinho" });
    expect(await management.stop(me, neighbour, "whatsapp")).toEqual({ kind: "other_account", title: "Do vizinho" });
    expect(await management.deletionTarget(me, neighbour)).toEqual({ kind: "other_account", title: "Do vizinho" });
    expect(await management.checkFollow(me, await refOf("T3"))).toEqual({ kind: "not_a_group", title: "T3" });
    expect(await management.checkFollow(me, "group:inexistente@g.us")).toEqual({ kind: "not_found" });
  });

  it("alvo da exclusão: a fonte do grupo, a própria conversa, ou nada guardado", async () => {
    const projeto = await management.deletionTarget(me, `group:${G(1)}`);
    expect(projeto).toMatchObject({ kind: "ok", title: "Projeto X" });
    const t3 = await management.deletionTarget(me, await refOf("T3"));
    expect(t3).toMatchObject({ kind: "ok", title: "T3" });
    expect(await management.deletionTarget(me, `group:${G(2)}`)).toEqual({ kind: "nothing_stored", title: "Família" });
  });

  it("D-14: o catálogo traz as fontes do espaço fora de exclusão", async () => {
    const titles = (await management.catalog(me.spaceId)).map((c) => c.title).sort();
    expect(titles).toEqual(["Conversa do canal de teste", "Projeto X", "T3"]);
    await db.pool.query("UPDATE sources SET status = 'deleting' WHERE space_id = $1 AND title = 'T3'", [me.spaceId]);
    expect((await management.catalog(me.spaceId)).map((c) => c.title)).not.toContain("T3");
    expect((await states())["T3"]).toBeUndefined();
  });
});
