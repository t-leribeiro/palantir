// Dados de seed (data-delta.md#6): operador, espaço pessoal, conta fake ativa e "Grupo de teste" autorizado.
import { withTransaction, type Pool, type PoolClient } from "../platform/db/index.js";

export interface SeedOptions {
  readonly displayName?: string;
  readonly provider?: string;
  readonly accountId?: string;
  readonly conversationId?: string;
  readonly conversationTitle?: string;
  readonly sourceStatus?: "authorized" | "not_authorized";
}

export interface SeedResult {
  readonly userId: string;
  readonly spaceId: string;
  readonly accountId: string;
  readonly sourceId: string;
}

const DEFAULTS = {
  displayName: "Operador",
  provider: "fake",
  accountId: "fake-operator",
  conversationId: "fake-group-1",
  conversationTitle: "Grupo de teste",
  sourceStatus: "authorized",
} as const satisfies Required<SeedOptions>;

/** Idempotente: rodar de novo reaproveita os registros existentes. */
export async function seedOperator(pool: Pool, options: SeedOptions = {}): Promise<SeedResult> {
  const o = { ...DEFAULTS, ...options };
  return withTransaction(pool, async (db) => {
    const { userId, accountId } = await ensureAccount(db, o);
    const spaceId = await ensurePersonalSpace(db, userId);
    const sourceId = await ensureSource(db, spaceId, accountId, o);
    return { userId, spaceId, accountId, sourceId };
  });
}

async function returningId(db: PoolClient, sql: string, params: unknown[]): Promise<string> {
  const { rows } = await db.query<{ id: string }>(sql, params);
  const id = rows[0]?.id;
  if (!id) throw new Error("Seed: o banco não devolveu o id esperado.");
  return id;
}

async function ensureAccount(db: PoolClient, o: Required<SeedOptions>): Promise<{ userId: string; accountId: string }> {
  const existing = await db.query<{ id: string; user_id: string }>(
    "SELECT id, user_id FROM channel_accounts WHERE provider = $1 AND external_account_id = $2",
    [o.provider, o.accountId],
  );
  const row = existing.rows[0];
  if (row) return { userId: row.user_id, accountId: row.id };
  const userId = await returningId(db, "INSERT INTO users (display_name) VALUES ($1) RETURNING id", [o.displayName]);
  const accountId = await returningId(
    db,
    `INSERT INTO channel_accounts (user_id, provider, external_account_id, status, verified_at)
     VALUES ($1, $2, $3, 'active', now()) RETURNING id`,
    [userId, o.provider, o.accountId],
  );
  return { userId, accountId };
}

function ensurePersonalSpace(db: PoolClient, userId: string): Promise<string> {
  return returningId(
    db,
    `INSERT INTO knowledge_spaces (owner_user_id, kind) VALUES ($1, 'personal')
     ON CONFLICT (owner_user_id) WHERE kind = 'personal' DO UPDATE SET kind = EXCLUDED.kind
     RETURNING id`,
    [userId],
  );
}

function ensureSource(db: PoolClient, spaceId: string, accountId: string, o: Required<SeedOptions>): Promise<string> {
  return returningId(
    db,
    `INSERT INTO sources (space_id, channel_account_id, external_conversation_id, title, kind, status)
     VALUES ($1, $2, $3, $4, 'group', $5)
     ON CONFLICT (channel_account_id, external_conversation_id) DO UPDATE SET title = EXCLUDED.title
     RETURNING id`,
    [spaceId, accountId, o.conversationId, o.conversationTitle, o.sourceStatus],
  );
}
