// T009 (feature 006): auditoria com PostgreSQL real; o nome do alvo só aparece enquanto ele existe.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOperator } from "../../src/main/seed-data.js";
import { createPgAuditLog } from "../../src/modules/sources/index.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";

let db: TestDatabase;

beforeAll(async () => {
  db = await startTestDatabase();
});

afterAll(async () => {
  await db?.stop();
});

describe("audit_events", () => {
  it("grava, lista do mais novo para o mais antigo e mostra o nome só da fonte que ainda existe", async () => {
    const seed = await seedOperator(db.pool, { conversationTitle: "Projeto X" });
    const audit = createPgAuditLog(db.pool);
    await audit.record({ actorUserId: seed.userId, action: "capture.authorized", targetKind: "source", targetId: seed.sourceId, channel: "whatsapp" });
    await audit.record({ actorUserId: null, action: "source.deleted", targetKind: "source", targetId: "00000000-0000-0000-0000-000000000042", details: { messages: 3 } });
    await audit.record({ actorUserId: seed.userId, action: "account.verified", targetKind: "channel_account", targetId: seed.accountId, channel: "fake" });

    const entries = await audit.list({ limit: 10 });
    expect(entries.map((e) => e.action)).toEqual(["account.verified", "source.deleted", "capture.authorized"]);
    expect(entries[0]).toMatchObject({ targetLabel: "fake-operator", channel: "fake", details: {} });
    expect(entries[1]).toMatchObject({ targetLabel: null, actorUserId: null, details: { messages: 3 }, channel: null });
    expect(entries[2]).toMatchObject({ targetLabel: "Projeto X" });
    expect(await audit.list({ limit: 10, since: new Date(Date.now() + 60_000) })).toEqual([]);
    await expect(audit.record({ actorUserId: null, action: "source.deleted", targetKind: "source", targetId: seed.sourceId, details: { title: "x" } as never })).rejects.toThrow(
      "contagens",
    );
  });
});
