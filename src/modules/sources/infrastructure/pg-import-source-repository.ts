import type { Queryable } from "../../../platform/db/index.js";
import type { ImportSourceRepository } from "../application/ensure-import-source.js";

export function createPgImportSourceRepository(db: Queryable): ImportSourceRepository {
  return {
    async ensurePendingAccount(userId, provider, externalAccountId) {
      const existing = await db.query<{ id: string; external_account_id: string }>(
        "SELECT id, external_account_id FROM channel_accounts WHERE user_id = $1 AND provider = $2 ORDER BY verified_at NULLS LAST LIMIT 1",
        [userId, provider],
      );
      const row = existing.rows[0];
      if (row) return { accountRowId: row.id, externalAccountId: row.external_account_id };
      const created = await db.query<{ id: string }>(
        `INSERT INTO channel_accounts (user_id, provider, external_account_id, status)
         VALUES ($1, $2, $3, 'pending')
         ON CONFLICT (provider, external_account_id) DO UPDATE SET provider = EXCLUDED.provider
         RETURNING id`,
        [userId, provider, externalAccountId],
      );
      return { accountRowId: created.rows[0]?.id as string, externalAccountId };
    },

    async ensureAuthorizedSource({ spaceId, accountRowId, conversationId, title }) {
      // xmax = 0 identifica linha recém-inserida; em conflito, a importação reautoriza (opt-in explícito),
      // exceto se a fonte estiver em exclusão.
      const { rows } = await db.query<{ id: string; status: string; created: boolean }>(
        `INSERT INTO sources (space_id, channel_account_id, external_conversation_id, title, kind, status)
         VALUES ($1, $2, $3, $4, 'group', 'authorized')
         ON CONFLICT (channel_account_id, external_conversation_id) DO UPDATE
           SET status = CASE WHEN sources.status = 'deleting' THEN 'deleting' ELSE 'authorized' END
         RETURNING id, status, (xmax = 0) AS created`,
        [spaceId, accountRowId, conversationId, title],
      );
      const row = rows[0];
      if (!row) throw new Error("Falha ao registrar a conversa importada.");
      return { sourceId: row.id, status: row.status, created: row.created };
    },
  };
}
