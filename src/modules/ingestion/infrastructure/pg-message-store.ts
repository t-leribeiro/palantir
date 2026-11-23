import type { Queryable } from "../../../platform/db/index.js";
import type { InsertResult, MessageStore } from "../application/ports.js";
import type { NewMessage } from "../domain/message.js";

/** Grava participante, mensagem e proveniência; duplicata por (fonte, id externo) devolve o id existente. */
export function createPgMessageStore(db: Queryable): MessageStore {
  return {
    async insert(message: NewMessage): Promise<InsertResult> {
      const participantId = await upsertParticipant(db, message);
      const quotedId = await resolveQuoted(db, message);
      const target = conflictTarget(message);
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO messages (id, space_id, source_id, participant_id, external_message_id, import_key, kind, text,
                               quoted_message_id, is_forwarded, sent_at)
         VALUES ($1, $2, $3, $4, $5, $11, $6, $7, $8, $9, $10)
         ${target.onConflict}
         RETURNING id`,
        [
          message.id,
          message.spaceId,
          message.sourceId,
          participantId,
          message.externalMessageId ?? null,
          message.kind,
          message.text ?? null,
          quotedId,
          message.isForwarded,
          message.sentAt,
          message.importKey ?? null,
        ],
      );
      const insertedId = inserted.rows[0]?.id;
      if (insertedId) {
        await addProvenance(db, insertedId, message);
        return { status: "inserted", id: insertedId };
      }
      const existing = await db.query<{ id: string }>(
        `SELECT id FROM messages WHERE source_id = $1 AND ${target.column} = $2`,
        [message.sourceId, target.value],
      );
      const existingId = existing.rows[0]?.id;
      if (!existingId) throw new Error("Conflito de unicidade sem mensagem existente correspondente.");
      await addProvenance(db, existingId, message);
      return { status: "duplicate", id: existingId };
    },
  };
}

/** Alvo do ON CONFLICT: índice parcial do id externo (ao vivo) ou da chave de importação (D-09 da S1). */
function conflictTarget(message: NewMessage): { onConflict: string; column: string; value: string | null } {
  if (message.importKey && !message.externalMessageId) {
    return {
      onConflict: "ON CONFLICT (source_id, import_key) WHERE import_key IS NOT NULL DO NOTHING",
      column: "import_key",
      value: message.importKey,
    };
  }
  return {
    onConflict: "ON CONFLICT (source_id, external_message_id) WHERE external_message_id IS NOT NULL DO NOTHING",
    column: "external_message_id",
    value: message.externalMessageId ?? null,
  };
}

async function upsertParticipant(db: Queryable, message: NewMessage): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO participants (source_id, external_id, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (source_id, external_id)
       DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, participants.display_name)
     RETURNING id`,
    [message.sourceId, message.sender.externalId, message.sender.displayName ?? null],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("Falha ao registrar participante.");
  return id;
}

async function resolveQuoted(db: Queryable, message: NewMessage): Promise<string | null> {
  if (!message.quotedExternalMessageId) return null;
  const { rows } = await db.query<{ id: string }>(
    "SELECT id FROM messages WHERE source_id = $1 AND external_message_id = $2",
    [message.sourceId, message.quotedExternalMessageId],
  );
  return rows[0]?.id ?? null;
}

async function addProvenance(db: Queryable, messageId: string, message: NewMessage): Promise<void> {
  await db.query(
    `INSERT INTO message_provenance (message_id, capture_method, adapter, captured_at)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [messageId, message.provenance.captureMethod, message.provenance.adapter, message.provenance.capturedAt],
  );
}
