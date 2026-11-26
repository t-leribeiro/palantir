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

  it("feature 008 (D-02, D-03): as citações da última resposta ficam por usuário e canal, sem mexer na lista nem na pendente", async () => {
    const state = createPgConversationState(db.pool);
    expect(await state.citations(userId, "fake")).toBeNull();
    const at = new Date("2026-11-25T21:00:00Z");
    const items = [
      { index: 1, messageId: "6f1c8a52-1d3e-4a4b-9a0e-2b4f0c9d7e11", kind: "audio", audioStartS: 37, audioEndS: 45 },
      { index: 2, messageId: "0a05cfd1-7a02-4687-86d3-dbe8526cf836", kind: "text" },
    ];
    const listingBefore = await state.listing(userId, "fake");
    await state.savePending(userId, "fake", { pending: { action: "follow", ref: "group:9@g.us", title: "Y" }, expiresAt: now });
    await state.saveCitations(userId, "fake", { items, at });
    expect(await state.citations(userId, "fake")).toEqual({ items, at });
    expect(await state.citations(userId, "whatsapp")).toBeNull();
    expect(await state.listing(userId, "fake")).toEqual(listingBefore);
    expect((await state.pending(userId, "fake"))?.pending.ref).toBe("group:9@g.us");
    await state.saveCitations(userId, "fake", { items: items.slice(1), at: now });
    expect((await state.citations(userId, "fake"))?.items).toHaveLength(1);
    const { rows } = await db.pool.query<{ citations: string }>("SELECT citations::text FROM agent_conversation_state WHERE user_id = $1 AND provider = 'fake'", [userId]);
    expect(rows[0]?.citations).not.toMatch(/Ana|T3|texto/);
  });
});
