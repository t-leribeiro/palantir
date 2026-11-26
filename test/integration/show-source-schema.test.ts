// T001 (feature 008): migração 0010 com PostgreSQL real (data-delta.md §1).
import { runner } from "node-pg-migrate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOperator } from "../../src/main/seed-data.js";
import { MIGRATIONS_DIR } from "../../src/platform/db/migrate.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";

let db: TestDatabase;
let userId: string;

const step = (direction: "up" | "down") =>
  runner({ databaseUrl: db.url, dir: MIGRATIONS_DIR, direction, count: 1, migrationsTable: "pgmigrations", singleTransaction: true, log: () => undefined });

const columns = async () =>
  (
    await db.pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'agent_conversation_state' AND column_name LIKE 'citations%' ORDER BY 1",
    )
  ).rows.map((r) => r.column_name);

beforeAll(async () => {
  db = await startTestDatabase();
  userId = (await seedOperator(db.pool)).userId;
});

afterAll(async () => {
  await db?.stop();
});

describe("0010_show_source", () => {
  it("citations aceita só lista; o down tira as duas colunas e o up as devolve", async () => {
    expect(await columns()).toEqual(["citations", "citations_at"]);
    await db.pool.query("INSERT INTO agent_conversation_state (user_id, provider, citations, citations_at) VALUES ($1, 'fake', '[]', now())", [userId]);
    await expect(db.pool.query("UPDATE agent_conversation_state SET citations = '{}' WHERE user_id = $1", [userId])).rejects.toThrow(/check/i);
    await step("down");
    expect(await columns()).toEqual([]);
    await step("up");
    expect(await columns()).toEqual(["citations", "citations_at"]);
  });
});
