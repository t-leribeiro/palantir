import type { Queryable } from "../../../platform/db/index.js";
import type { SourceRepository } from "../application/is-source-authorized.js";
import type { Source, SourceKind, SourceStatus } from "../domain/source.js";

interface Row {
  id: string;
  space_id: string;
  channel_account_id: string;
  external_conversation_id: string;
  title: string;
  kind: SourceKind;
  status: SourceStatus;
}

export function createPgSourceRepository(db: Queryable): SourceRepository {
  return {
    async findByConversation({ provider, accountId, conversationId }): Promise<Source | null> {
      const { rows } = await db.query<Row>(
        `SELECT s.id, s.space_id, s.channel_account_id, s.external_conversation_id, s.title, s.kind, s.status
           FROM sources s
           JOIN channel_accounts a ON a.id = s.channel_account_id
          WHERE a.provider = $1 AND a.external_account_id = $2 AND s.external_conversation_id = $3`,
        [provider, accountId, conversationId],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        spaceId: row.space_id,
        channelAccountId: row.channel_account_id,
        externalConversationId: row.external_conversation_id,
        title: row.title,
        kind: row.kind,
        status: row.status,
      };
    },
  };
}
