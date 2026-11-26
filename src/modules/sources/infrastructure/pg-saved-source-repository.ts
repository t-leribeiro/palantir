// Fonte Guardados no PostgreSQL (feature 009, data-delta.md §3). O índice `sources_one_saved_per_space` garante uma
// por espaço; a corrida entre dois pedidos simultâneos vira `null` e quem chamou relê a existente.
import { isUniqueViolation, type Queryable } from "../../../platform/db/index.js";
import { SAVED_CONVERSATION_ID, SAVED_SOURCE_TITLE, type SavedSourceRef, type SavedSourceRepository } from "../application/ensure-saved-source.js";

interface Row {
  id: string;
  provider: string;
  external_account_id: string;
  external_conversation_id: string;
}

const toRef = (r: Row): SavedSourceRef => ({ sourceId: r.id, provider: r.provider, accountId: r.external_account_id, conversationId: r.external_conversation_id });

export function createPgSavedSourceRepository(db: Queryable): SavedSourceRepository {
  return {
    async find(spaceId) {
      const { rows } = await db.query<Row>(
        `SELECT s.id, a.provider, a.external_account_id, s.external_conversation_id
           FROM sources s JOIN channel_accounts a ON a.id = s.channel_account_id
          WHERE s.space_id = $1 AND s.kind = 'saved' AND s.status <> 'deleting'`,
        [spaceId],
      );
      return rows[0] ? toRef(rows[0]) : null;
    },
    async create({ spaceId, provider, externalAccountId }) {
      try {
        const { rows } = await db.query<Row>(
          `INSERT INTO sources (space_id, channel_account_id, external_conversation_id, title, kind, status)
           SELECT k.id, a.id, $4, $5, 'saved', 'authorized'
             FROM channel_accounts a JOIN knowledge_spaces k ON k.owner_user_id = a.user_id AND k.kind = 'personal'
            WHERE k.id = $1 AND a.provider = $2 AND a.external_account_id = $3 AND a.status = 'active'
           RETURNING id, $2::text AS provider, $3::text AS external_account_id, external_conversation_id`,
          [spaceId, provider, externalAccountId, SAVED_CONVERSATION_ID, SAVED_SOURCE_TITLE],
        );
        return rows[0] ? toRef(rows[0]) : null;
      } catch (error) {
        if (isUniqueViolation(error)) return null;
        throw error;
      }
    },
  };
}
