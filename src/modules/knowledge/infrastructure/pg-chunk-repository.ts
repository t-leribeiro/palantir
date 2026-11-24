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
      if (!row) return null;
      // Feature 005: segmentos da transcrição ativa do anexo da mensagem, se houver.
      const segments = await db.query<{ start_s: string; end_s: string; text: string }>(
        `SELECT s.start_s, s.end_s, s.text
           FROM attachments a
           JOIN transcripts t ON t.attachment_id = a.id AND t.is_active AND NOT t.empty
           JOIN transcript_segments s ON s.transcript_id = t.id
          WHERE a.message_id = $1
          ORDER BY s.idx`,
        [messageId],
      );
      return {
        messageId: row.id,
        spaceId: row.space_id,
        text: row.text,
        segments: segments.rows.map((s) => ({ start: Number(s.start_s), end: Number(s.end_s), text: s.text })),
      };
    },
    async replaceChunks(messageId, chunks) {
      for (const chunk of chunks) {
        await db.query(
          `INSERT INTO message_chunks (space_id, message_id, idx, text, audio_start_s, audio_end_s)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (message_id, idx) DO UPDATE
             SET text = EXCLUDED.text, space_id = EXCLUDED.space_id,
                 audio_start_s = EXCLUDED.audio_start_s, audio_end_s = EXCLUDED.audio_end_s`,
          [chunk.spaceId, chunk.messageId, chunk.idx, chunk.text, chunk.audioStartS ?? null, chunk.audioEndS ?? null],
        );
      }
      await db.query("DELETE FROM message_chunks WHERE message_id = $1 AND idx >= $2", [messageId, chunks.length]);
    },
  };
}
