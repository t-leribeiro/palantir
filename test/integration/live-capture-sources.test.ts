// Feature 004 (S3) com PostgreSQL real: tabelas da captura (T001) e autorização de captura (T007).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOperator } from "../../src/main/seed-data.js";
import { formatResult, parseGroupsArgs, runGroups } from "../../src/main/whatsapp-groups.js";
import { createPgIdentityRepository, createResolveUserByChannelAccount } from "../../src/modules/identity/index.js";
import {
  createCaptureAdmin,
  createEnsureImportSource,
  createIsSourceAuthorized,
  createPgCaptureRepository,
  createPgGroupDirectory,
  createPgImportSourceRepository,
  createPgSourceRepository,
  createRouteGroup,
  createSyncGroupDirectory,
} from "../../src/modules/sources/index.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";

let db: TestDatabase;
let userId: string;
let spaceId: string;
let sourceId: string;

beforeAll(async () => {
  db = await startTestDatabase();
  await seedOperator(db.pool);
  const operator = await createResolveUserByChannelAccount(createPgIdentityRepository(db.pool))("fake", "fake-operator");
  if (!operator) throw new Error("seed sem operador");
  userId = operator.userId;
  spaceId = operator.spaceId;
  sourceId = (await createEnsureImportSource(createPgImportSourceRepository(db.pool))(operator, "Grupo de teste")).sourceId;
});

afterAll(async () => {
  await db?.stop();
});

const CONSENT = "todos avisados em 23/11, ninguém se opôs";

async function authorize(groupId: string, consent = CONSENT) {
  return db.pool.query(
    "INSERT INTO source_captures (source_id, provider, group_id, authorized_by, consent_statement) VALUES ($1, 'whatsapp', $2, $3, $4) RETURNING id",
    [sourceId, groupId, userId, consent],
  );
}

describe("tabelas da captura (T001)", () => {
  it("no máximo uma captura ativa por grupo; depois de revogar, uma nova é aceita", async () => {
    await authorize("111@g.us");
    await expect(authorize("111@g.us")).rejects.toThrow(/source_captures_one_active/);
    await db.pool.query("UPDATE source_captures SET revoked_at = now() WHERE group_id = '111@g.us' AND revoked_at IS NULL");
    await authorize("111@g.us");
    const { rows } = await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM source_captures WHERE group_id = '111@g.us'");
    expect(rows[0]?.n).toBe(2);
  });

  it("recusa declaração de consentimento curta demais", async () => {
    await expect(authorize("222@g.us", "ok")).rejects.toThrow(/check/i);
  });

  it("o diretório de grupos não tem colunas de pessoas nem de mensagens", async () => {
    const { rows } = await db.pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'whatsapp_groups' ORDER BY column_name",
    );
    expect(rows.map((r) => r.column_name)).toEqual(["group_id", "left_at", "participants", "seen_at", "subject"]);
  });
});

describe("autorização de captura com PostgreSQL (T007)", () => {
  const admin = () =>
    createCaptureAdmin({
      directory: createPgGroupDirectory(db.pool),
      captures: createPgCaptureRepository(db.pool),
      sources: createPgImportSourceRepository(db.pool),
    });

  it("diretório: lista completa grava e marca quem saiu; reaparecer limpa a saída", async () => {
    const sync = createSyncGroupDirectory(createPgGroupDirectory(db.pool));
    await sync([{ groupId: "900@g.us", subject: "Saiu", participants: 3 }], true);
    await sync([{ groupId: "901@g.us", subject: "Grupo de teste ao vivo", participants: 5 }, { groupId: "902@g.us", subject: "Família", participants: 12 }], true);
    const listing = await admin().list();
    const byId = new Map(listing.groups.map((g) => [g.groupId, g]));
    expect(byId.get("900@g.us")?.leftAt).not.toBeNull();
    expect(byId.get("901@g.us")).toMatchObject({ subject: "Grupo de teste ao vivo", participants: 5, leftAt: null, status: { kind: "not_authorized" } });
    await sync([{ groupId: "900@g.us", subject: "Saiu", participants: 3 }], false);
    expect((await admin().list()).groups.find((g) => g.groupId === "900@g.us")?.leftAt).toBeNull();
  });

  it("autorizar com --conversa roteia para a fonte importada; a ingestão aceita pelo mesmo id de conversa", async () => {
    const result = await admin().authorize({ owner: { userId, spaceId }, group: "901@g.us", consent: CONSENT, conversation: "Grupo de teste" });
    expect(result).toMatchObject({ subject: "Grupo de teste ao vivo", sourceTitle: "Grupo de teste", linkedToImport: true });
    const route = await createRouteGroup(createPgCaptureRepository(db.pool))("901@g.us");
    expect(route).toMatchObject({ provider: "whatsapp", conversationId: "export:grupo-de-teste", sourceId });
    if (!route) throw new Error("sem rota");
    const check = await createIsSourceAuthorized(createPgSourceRepository(db.pool))(route);
    expect(check).toEqual({ status: "authorized", sourceId, spaceId });
    const { rows } = await db.pool.query<{ consent_statement: string; authorized_by: string }>(
      "SELECT consent_statement, authorized_by FROM source_captures WHERE group_id = '901@g.us'",
    );
    expect(rows).toEqual([{ consent_statement: CONSENT, authorized_by: userId }]);
  });

  it("segunda autorização ativa do mesmo grupo é recusada; revogar e reautorizar mantêm a mesma fonte", async () => {
    await expect(admin().authorize({ owner: { userId, spaceId }, group: "901@g.us", consent: CONSENT })).rejects.toMatchObject({ code: "already_authorized" });
    await admin().revoke("901@g.us");
    expect(await createRouteGroup(createPgCaptureRepository(db.pool))("901@g.us")).toBeNull();
    expect((await admin().list()).groups.find((g) => g.groupId === "901@g.us")?.status.kind).toBe("revoked");
    await admin().authorize({ owner: { userId, spaceId }, group: "901@g.us", consent: CONSENT, conversation: "Grupo de teste" });
    expect((await createRouteGroup(createPgCaptureRepository(db.pool))("901@g.us"))?.sourceId).toBe(sourceId);
  });

  it("sem --conversa cria uma fonte de grupo autorizada com o nome do grupo e o id do WhatsApp", async () => {
    await admin().authorize({ owner: { userId, spaceId }, group: "902@g.us", consent: CONSENT });
    const route = await createRouteGroup(createPgCaptureRepository(db.pool))("902@g.us");
    expect(route?.conversationId).toBe("902@g.us");
    const { rows } = await db.pool.query<{ title: string; status: string; kind: string }>("SELECT title, status, kind FROM sources WHERE id = $1", [route?.sourceId]);
    expect(rows[0]).toEqual({ title: "Família", status: "authorized", kind: "group" });
  });
});

describe("comando whatsapp:grupos com PostgreSQL (T012)", () => {
  it("lista, autoriza com consentimento e revoga; erros de domínio chegam com a mensagem do comando", async () => {
    await createSyncGroupDirectory(createPgGroupDirectory(db.pool))([{ groupId: "950@g.us", subject: "Zeta teste CLI", participants: 4 }], false);
    const listed = await runGroups(parseGroupsArgs([]), db.pool);
    const text = formatResult(listed);
    expect(text).toMatch(/Zeta teste CLI\s+4 participantes {3}não autorizado/);
    const position = text.split("\n").find((l) => l.includes("Zeta teste CLI"))?.trim().split(".")[0] ?? "";

    await expect(runGroups(parseGroupsArgs(["autorizar", position]), db.pool)).rejects.toThrow(/--consentimento com 10 a 500/);
    const authorized = await runGroups(parseGroupsArgs(["autorizar", position, "--consentimento", CONSENT]), db.pool);
    expect(formatResult(authorized)).toBe('Grupo "Zeta teste CLI" autorizado para captura (fonte nova "Zeta teste CLI"). Mensagens novas a partir de agora.');
    await expect(runGroups(parseGroupsArgs(["autorizar", "950", "--consentimento", CONSENT]), db.pool)).rejects.toThrow(/já está autorizado/);

    const revoked = await runGroups(parseGroupsArgs(["revogar", "950@g.us"]), db.pool);
    expect(formatResult(revoked)).toContain('Captura do grupo "Zeta teste CLI" revogada.');
    await expect(runGroups(parseGroupsArgs(["revogar", "950"]), db.pool)).rejects.toThrow("O grupo não está autorizado.");
    await expect(runGroups(parseGroupsArgs(["autorizar", "950", "--consentimento", CONSENT, "--dono", "fake:ninguem"]), db.pool)).rejects.toThrow(
      /Dono não encontrado/,
    );
  });
});
