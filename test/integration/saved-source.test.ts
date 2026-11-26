// T020 (feature 009, D-08, D-15): a fonte Guardados de cada espaço, com PostgreSQL real.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOperator, type SeedResult } from "../../src/main/seed-data.js";
import {
  SAVED_CONVERSATION_ID,
  createCaptureAdmin,
  createEnsureSavedSource,
  createPgAuditLog,
  createPgCaptureRepository,
  createPgGroupDirectory,
  createPgImportSourceRepository,
  createPgSavedSourceRepository,
  createPgSpaceSourceRepository,
  createSourceManagement,
  type EnsureSavedSource,
} from "../../src/modules/sources/index.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";
import { one } from "../support/rows.js";

let db: TestDatabase;
let ensure: EnsureSavedSource;
let me: SeedResult;

beforeAll(async () => {
  db = await startTestDatabase();
  me = await seedOperator(db.pool, { conversationTitle: "Zeta" });
  ensure = createEnsureSavedSource(createPgSavedSourceRepository(db.pool));
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

const savedCount = async (spaceId: string) =>
  one((await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM sources WHERE space_id = $1 AND kind = 'saved'", [spaceId])).rows).n;

describe("fonte Guardados", () => {
  it("cria uma vez, autorizada, e devolve a mesma depois, mesmo em pedidos simultâneos", async () => {
    const [a, b] = await Promise.all([ensure({ spaceId: me.spaceId, provider: "fake", externalAccountId: "fake-operator" }), ensure({ spaceId: me.spaceId, provider: "fake", externalAccountId: "fake-operator" })]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ provider: "fake", accountId: "fake-operator", conversationId: SAVED_CONVERSATION_ID });
    expect(await ensure({ spaceId: me.spaceId, provider: "fake", externalAccountId: "fake-operator" })).toEqual(a);
    expect(await savedCount(me.spaceId)).toBe(1);
    const status = one((await db.pool.query<{ status: string }>("SELECT status FROM sources WHERE id = $1", [a.sourceId])).rows).status;
    expect(status).toBe("authorized");
  });

  it("não cria para conta que não é do espaço", async () => {
    const other = await seedOperator(db.pool, { accountId: "outro", displayName: "Outro", conversationId: "do-outro" });
    await expect(ensure({ spaceId: other.spaceId, provider: "fake", externalAccountId: "fake-operator" })).rejects.toThrow(/Guardados/);
    expect(await savedCount(other.spaceId)).toBe(0);
  });

  it("aparece por último na lista de gestão, com estado próprio, e não é um grupo para acompanhar", async () => {
    const captures = createPgCaptureRepository(db.pool);
    const directory = createPgGroupDirectory(db.pool);
    const admin = createCaptureAdmin({ directory, captures, sources: createPgImportSourceRepository(db.pool) });
    const management = createSourceManagement({ directory, captures, admin, spaceSources: createPgSpaceSourceRepository(db.pool), audit: createPgAuditLog(db.pool) });
    const items = await management.list(me);
    expect(items.at(-1)).toMatchObject({ title: "Guardados", state: "saved" });
    const ref = items.at(-1)?.ref ?? "";
    expect(await management.checkFollow(me, ref)).toEqual({ kind: "not_a_group", title: "Guardados" });
    expect(await management.deletionTarget(me, ref)).toMatchObject({ kind: "ok", title: "Guardados" });
  });
});
