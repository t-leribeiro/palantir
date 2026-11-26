// T001 (feature 009): migração 0011 com PostgreSQL real (data-delta.md §6).
import { runner } from "node-pg-migrate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOperator } from "../../src/main/seed-data.js";
import { MIGRATIONS_DIR } from "../../src/platform/db/migrate.js";
import { insertMessageWithChunk } from "../support/chunks.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";
import { one } from "../support/rows.js";

let db: TestDatabase;
let spaceId: string;
let accountId: string;
let sourceId: string;

const step = (direction: "up" | "down") =>
  runner({ databaseUrl: db.url, dir: MIGRATIONS_DIR, direction, count: 1, migrationsTable: "pgmigrations", singleTransaction: true, log: () => undefined });

const tables = async () =>
  (
    await db.pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_name IN ('themes', 'knowledge_items', 'evidence_references') ORDER BY 1",
    )
  ).rows.map((r) => r.table_name);

const count = async (table: string) => one((await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows).n;

async function theme(name: string): Promise<string> {
  const { rows } = await db.pool.query<{ id: string }>("INSERT INTO themes (space_id, name, normalized) VALUES ($1, $2, lower($2)) RETURNING id", [spaceId, name]);
  return one(rows).id;
}

async function item(themeId: string, messageId: string): Promise<string> {
  const { rows } = await db.pool.query<{ id: string }>(
    "INSERT INTO knowledge_items (space_id, kind, theme_id, created_by) VALUES ($1, 'saved', $2, 'user') RETURNING id",
    [spaceId, themeId],
  );
  const id = one(rows).id;
  await db.pool.query("INSERT INTO evidence_references (knowledge_item_id, message_id) VALUES ($1, $2)", [id, messageId]);
  return id;
}

beforeAll(async () => {
  db = await startTestDatabase();
  ({ spaceId, accountId, sourceId } = await seedOperator(db.pool));
});

afterAll(async () => {
  await db?.stop();
});

describe("0011_saved_items", () => {
  it("o down tira as tabelas novas e o up as devolve", async () => {
    expect(await tables()).toEqual(["evidence_references", "knowledge_items", "themes"]);
    await step("down");
    expect(await tables()).toEqual([]);
    await step("up");
    expect(await tables()).toEqual(["evidence_references", "knowledge_items", "themes"]);
  });

  it("aceita uma fonte Guardados por espaço e recusa a segunda", async () => {
    const insert = (conversation: string) =>
      db.pool.query(
        "INSERT INTO sources (space_id, channel_account_id, external_conversation_id, title, kind, status) VALUES ($1, $2, $3, 'Guardados', 'saved', 'authorized')",
        [spaceId, accountId, conversation],
      );
    await insert("palantir:guardados");
    await expect(insert("palantir:guardados-2")).rejects.toThrow(/sources_one_saved_per_space/);
  });

  it("item guardado exige tema, e o tema é único por espaço pela forma normalizada", async () => {
    await expect(db.pool.query("INSERT INTO knowledge_items (space_id, kind, created_by) VALUES ($1, 'saved', 'user')", [spaceId])).rejects.toThrow(/check/i);
    await theme("Leituras");
    await expect(theme("leituras")).rejects.toThrow(/unique|duplicate/i);
  });

  it("apagar a mensagem apaga o item e o tema que ficou vazio, mas não o tema que ainda tem itens", async () => {
    const arquitetura = await theme("Arquitetura");
    const first = await insertMessageWithChunk(db.pool, { spaceId, sourceId, text: "o Temporal resolveu" });
    const second = await insertMessageWithChunk(db.pool, { spaceId, sourceId, text: "filas com pg-boss" });
    await item(arquitetura, first.messageId);
    await item(arquitetura, second.messageId);
    const before = { items: await count("knowledge_items"), themes: await count("themes") };

    await db.pool.query("DELETE FROM messages WHERE id = $1", [first.messageId]);
    expect(await count("knowledge_items")).toBe(before.items - 1);
    expect(await count("themes")).toBe(before.themes);

    await db.pool.query("DELETE FROM messages WHERE id = $1", [second.messageId]);
    expect(await count("knowledge_items")).toBe(before.items - 2);
    expect(await count("themes")).toBe(before.themes - 1);
  });

  it("a auditoria aceita guardar e esquecer um item", async () => {
    const insert = (action: string) =>
      db.pool.query("INSERT INTO audit_events (action, target_kind, target_id) VALUES ($1, 'knowledge_item', gen_random_uuid())", [action]);
    await insert("knowledge.item_saved");
    await insert("knowledge.item_forgotten");
    await expect(insert("knowledge.item_renamed")).rejects.toThrow(/check/i);
  });
});
