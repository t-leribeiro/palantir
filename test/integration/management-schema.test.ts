// T001 (feature 006): migração 0008 com PostgreSQL real (data-delta.md).
import { runner } from "node-pg-migrate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOperator } from "../../src/main/seed-data.js";
import { MIGRATIONS_DIR } from "../../src/platform/db/migrate.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";
import { one } from "../support/rows.js";

let db: TestDatabase;
let userId: string;

// A 0008 deixou de ser a última (features 007 a 009): desfaz e refaz também as posteriores a ela.
const step = (direction: "up" | "down", count = 4) =>
  runner({ databaseUrl: db.url, dir: MIGRATIONS_DIR, direction, count, migrationsTable: "pgmigrations", singleTransaction: true, log: () => undefined });

beforeAll(async () => {
  db = await startTestDatabase();
  await seedOperator(db.pool);
  userId = one((await db.pool.query<{ id: string }>("INSERT INTO users (display_name) VALUES ('Leandro') RETURNING id")).rows).id;
});

afterAll(async () => {
  await db?.stop();
});

async function account(provider: string, external: string, status: string, verified: boolean): Promise<string> {
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO channel_accounts (user_id, provider, external_account_id, status, verified_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN now() END) RETURNING id`,
    [userId, provider, external, status, verified],
  );
  return one(rows).id;
}

const statusOf = async (id: string) => one((await db.pool.query<{ status: string }>("SELECT status FROM channel_accounts WHERE id = $1", [id])).rows).status;

describe("0008_source_management", () => {
  it("RF-15: contas ativas sem verificação voltam a pendente; verificadas e do canal de teste ficam como estão", async () => {
    await step("down");
    const unverified = await account("whatsapp", "+5511999990001", "active", false);
    const verified = await account("whatsapp", "+5511999990002", "active", true);
    const fake = await account("fake", "fake-sem-verificacao", "active", false);
    await step("up");
    expect(await statusOf(unverified)).toBe("pending");
    expect(await statusOf(verified)).toBe("active");
    expect(await statusOf(fake)).toBe("active");
  });

  it("um código vivo por conta; tentativas entre 0 e 5", async () => {
    const id = await account("whatsapp", "+5511999990003", "pending", false);
    const insert = () =>
      db.pool.query(
        `INSERT INTO channel_account_verifications (account_id, code_salt, code_hash, expires_at)
         VALUES ($1, '\\x00', '\\x00', now() + interval '10 minutes')`,
        [id],
      );
    await insert();
    await expect(insert()).rejects.toThrow(/channel_account_verifications_one_live/);
    await db.pool.query("UPDATE channel_account_verifications SET invalidated_at = now() WHERE account_id = $1", [id]);
    await insert();
    await expect(db.pool.query("UPDATE channel_account_verifications SET attempts = 6 WHERE account_id = $1", [id])).rejects.toThrow(/attempts/);
  });

  it("auditoria só aceita as ações conhecidas e não depende do alvo existir", async () => {
    const insert = (action: string) =>
      db.pool.query("INSERT INTO audit_events (action, target_kind, target_id) VALUES ($1, 'source', gen_random_uuid())", [action]);
    await insert("source.deleted");
    await expect(insert("source.renamed")).rejects.toThrow(/audit_events_action_check/);
  });

  it("um pedido de exclusão em andamento por fonte; aviso exige provedor e conta juntos", async () => {
    const space = one((await db.pool.query<{ id: string }>("SELECT id FROM knowledge_spaces LIMIT 1")).rows).id;
    const insert = (source: string, notify: [string | null, string | null] = [null, null]) =>
      db.pool.query(
        "INSERT INTO source_deletions (source_id, space_id, requested_by, notify_provider, notify_account) VALUES ($1, $2, $3, $4, $5)",
        [source, space, userId, ...notify],
      );
    const source = "00000000-0000-0000-0000-000000000001";
    await insert(source);
    await expect(insert(source)).rejects.toThrow(/source_deletions_one_open/);
    await expect(insert("00000000-0000-0000-0000-000000000002", ["whatsapp", null])).rejects.toThrow(/check/);
  });

  it("estado da conversa: uma linha por usuário e provedor, apagada com o usuário", async () => {
    await db.pool.query("INSERT INTO agent_conversation_state (user_id, provider, listing_page) VALUES ($1, 'whatsapp', 1)", [userId]);
    await expect(db.pool.query("INSERT INTO agent_conversation_state (user_id, provider) VALUES ($1, 'whatsapp')", [userId])).rejects.toThrow(/pkey/);
  });
});
