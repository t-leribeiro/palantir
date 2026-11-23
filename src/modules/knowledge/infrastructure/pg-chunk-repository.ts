import type { Queryable } from "../../../platform/db/index.js";
import type { ChunkRepository, IndexableMessage } from "../application/index-message.js";

export function createPgChunkRepository(db: Queryable): ChunkRepository {
  return {
    async loadMessage(messageId): Promise<IndexableMessage | null> {
      const { rows } = await db.query<{ id: string; space_id: string; text: string | null }>(
        "SELECT id, space_id, text FROM messages WHERE id = $1",
        [messageId],
      );
      const row = rows[0];
      return row ? { messageId: row.id, spaceId: row.space_id, text: row.text } : null;
    },
    async upsertChunk(chunk) {
      await db.query(
        `INSERT INTO message_chunks (space_id, message_id, idx, text)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (message_id, idx) DO UPDATE SET text = EXCLUDED.text, space_id = EXCLUDED.space_id`,
        [chunk.spaceId, chunk.messageId, chunk.idx, chunk.text],
      );
    },
  };
}
