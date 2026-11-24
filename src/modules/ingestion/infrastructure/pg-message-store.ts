import type { Queryable } from "../../../platform/db/index.js";
import type { InsertResult, MessageStore, ReconcileRow } from "../application/ports.js";
import type { NewMessage } from "../domain/message.js";
import type { ReconcileDirection } from "../domain/reconcile.js";

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

    async findByKey(message) {
      const target = conflictTarget(message);
      if (!target.value) return undefined;
      const { rows } = await db.query<{ id: string }>(`SELECT id FROM messages WHERE source_id = $1 AND ${target.column} = $2`, [
        message.sourceId,
        target.value,
      ]);
      return rows[0]?.id;
    },

    async reconcileCandidates({ sourceId, direction, from, to }): Promise<readonly ReconcileRow[]> {
      const missing = MISSING_KEY[direction];
      const { rows } = await db.query<{ id: string; sent_at: Date; text: string; display_name: string | null }>(
        `SELECT m.id, m.sent_at, m.text, p.display_name
           FROM messages m JOIN participants p ON p.id = m.participant_id
          WHERE m.source_id = $1 AND m.sent_at BETWEEN $2 AND $3
            AND m.${missing.empty} IS NULL AND m.${missing.present} IS NOT NULL AND m.text IS NOT NULL
          ORDER BY m.sent_at, m.id
          FOR UPDATE OF m`,
        [sourceId, from, to],
      );
      return rows.map((r) => ({ id: r.id, sentAt: new Date(r.sent_at), text: r.text, authorName: r.display_name ?? undefined }));
    },

    async audioReconcileCandidates({ sourceId, direction, from, to, sha256 }) {
      const missing = MISSING_KEY[direction];
      const { rows } = await db.query<{ id: string; sent_at: Date; display_name: string | null }>(
        `SELECT m.id, m.sent_at, p.display_name
           FROM messages m
           JOIN participants p ON p.id = m.participant_id
           JOIN attachments a ON a.message_id = m.id
          WHERE m.source_id = $1 AND m.kind = 'audio' AND m.sent_at BETWEEN $2 AND $3
            AND a.source_id = $1 AND a.sha256 = $4
            AND m.${missing.empty} IS NULL AND m.${missing.present} IS NOT NULL
          ORDER BY m.sent_at, m.id
          FOR UPDATE OF m`,
        [sourceId, from, to, sha256],
      );
      return rows.map((r) => ({ id: r.id, sentAt: new Date(r.sent_at), authorName: r.display_name ?? undefined }));
    },

    async insertAttachment(messageId, a, processing) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO attachments (message_id, space_id, source_id, media_kind, mime_type, size_bytes, sha256, storage_key,
                                  duration_s, storage_status, unavailable_reason, processing_status)
         SELECT m.id, m.space_id, m.source_id, $2, $3, $4, $5, $6, $7, $8, $9, $10 FROM messages m WHERE m.id = $1
         RETURNING id`,
        [
          messageId,
          a.mediaKind,
          a.mimeType,
          a.sizeBytes ?? null,
          a.sha256 ?? null,
          a.storageKey ?? null,
          a.durationSeconds ?? null,
          a.storageStatus,
          a.unavailableReason ?? null,
          processing,
        ],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error("Falha ao gravar o anexo da mensagem.");
      return id;
    },

    async attachReconciled(messageId, message, direction) {
      const missing = MISSING_KEY[direction];
      const value = direction === "import_to_live" ? message.importKey : message.externalMessageId;
      await db.query(`UPDATE messages SET ${missing.empty} = $2 WHERE id = $1 AND ${missing.empty} IS NULL`, [messageId, value]);
      await addProvenance(db, messageId, message);
    },
  };
}

/** Coluna que falta na candidata (e será preenchida) e a que ela já tem, por sentido da reconciliação (D-09). */
const MISSING_KEY: Record<ReconcileDirection, { readonly empty: string; readonly present: string }> = {
  import_to_live: { empty: "import_key", present: "external_message_id" },
  live_to_import: { empty: "external_message_id", present: "import_key" },
};

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
