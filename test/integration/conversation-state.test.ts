// T014 (feature 006): estado curto da conversa com o agente no PostgreSQL (D-02).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOperator } from "../../src/main/seed-data.js";
import { createPgConversationState } from "../../src/modules/agent/index.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";

let db: TestDatabase;
let userId: string;

beforeAll(async () => {
  db = await startTestDatabase();
  userId = (await seedOperator(db.pool)).userId;
});

afterAll(async () => {
  await db?.stop();
});

const now = new Date("2026-11-24T20:00:00Z");
const item = { ref: "group:1@g.us", title: "Projeto X", state: "not_following" as const };

describe("estado curto da conversa", () => {
  it("guarda a lista e a página por usuário e canal", async () => {
    const state = createPgConversationState(db.pool);
    expect(await state.listing(userId, "fake")).toBeNull();
    await state.saveListing(userId, "fake", { items: [item], page: 1, at: now });
    await state.saveListing(userId, "fake", { items: [item], page: 2, at: now });
    expect(await state.listing(userId, "fake")).toEqual({ items: [item], page: 2, at: now });
    expect(await state.listing(userId, "whatsapp")).toBeNull();
  });

  it("a ação pendente é consumida uma vez, só se for a mesma e no prazo; a lista continua", async () => {
    const state = createPgConversationState(db.pool);
    const pending = { action: "delete" as const, ref: "source:abc", title: "T3" };
    const expiresAt = new Date(now.getTime() + 300_000);
    await state.savePending(userId, "fake", { pending, expiresAt });
    expect(await state.pending(userId, "fake")).toEqual({ pending, expiresAt });
    expect(await state.takePending(userId, "fake", "source:outra", now)).toBe(false);
    expect(await state.takePending(userId, "fake", "source:abc", new Date(now.getTime() + 300_001))).toBe(false);
    const results = await Promise.all([state.takePending(userId, "fake", "source:abc", now), state.takePending(userId, "fake", "source:abc", now)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await state.pending(userId, "fake")).toBeNull();
    expect((await state.listing(userId, "fake"))?.page).toBe(2);
  });

  it("limpar a pendente não mexe na lista", async () => {
    const state = createPgConversationState(db.pool);
    await state.savePending(userId, "fake", { pending: { action: "follow", ref: "group:1@g.us", title: "Projeto X" }, expiresAt: now });
    await state.clearPending(userId, "fake");
    expect(await state.pending(userId, "fake")).toBeNull();
    expect(await state.listing(userId, "fake")).not.toBeNull();
  });
});
