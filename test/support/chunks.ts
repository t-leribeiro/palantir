// Mensagem com um trecho indexado direto no banco, para testes de integração da busca (feature 007).
import { randomUUID } from "node:crypto";
import type { Queryable } from "../../src/platform/db/index.js";
import { one } from "./rows.js";

export interface SeededChunk {
  readonly messageId: string;
  readonly chunkId: string;
}

export async function insertMessageWithChunk(
  db: Queryable,
  input: { spaceId: string; sourceId: string; text: string; author?: string; kind?: "text" | "audio"; sentAt?: Date; externalId?: string },
): Promise<SeededChunk> {
  const author = input.author ?? "Ana";
  const participant = one(
    (
      await db.query<{ id: string }>(
        `INSERT INTO participants (source_id, external_id, display_name) VALUES ($1, $2, $2)
         ON CONFLICT (source_id, external_id) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id`,
        [input.sourceId, author],
      )
    ).rows,
  ).id;
  const messageId = randomUUID();
  await db.query(
    `INSERT INTO messages (id, space_id, source_id, participant_id, external_message_id, kind, text, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [messageId, input.spaceId, input.sourceId, participant, input.externalId ?? `ext-${messageId}`, input.kind ?? "text", input.text, input.sentAt ?? new Date()],
  );
  const chunkId = one(
    (
      await db.query<{ id: string }>(
        "INSERT INTO message_chunks (space_id, message_id, idx, text) VALUES ($1, $2, 0, $3) RETURNING id",
        [input.spaceId, messageId, input.text],
      )
    ).rows,
  ).id;
  return { messageId, chunkId };
}
