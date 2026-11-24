// Persistência do processamento de mídia (feature 005, D-13): anexo, transcrição versionada e segmentos,
// com o job de indexação no mesmo outbox (ADR-0003). Também a varredura de pendentes sem job.
import { withTransaction, type Pool, type Queryable } from "../../../platform/db/index.js";
import type { JobQueue } from "../../../platform/queue/index.js";
import type { AttachmentForProcessing, MediaTx, MediaUnitOfWork, ProcessorResult } from "../application/ports.js";
import type { MediaKind } from "../domain/media-policy.js";

interface Row {
  id: string;
  message_id: string;
  space_id: string;
  media_kind: MediaKind;
  mime_type: string;
  sha256: string | null;
  storage_key: string | null;
  duration_s: string | null;
  processing_status: AttachmentForProcessing["processingStatus"];
  created_at: Date;
}

const COLUMNS = "id, message_id, space_id, media_kind, mime_type, sha256, storage_key, duration_s, processing_status, created_at";

function toAttachment(row: Row): AttachmentForProcessing {
  return {
    id: row.id,
    messageId: row.message_id,
    spaceId: row.space_id,
    mediaKind: row.media_kind,
    mimeType: row.mime_type,
    sha256: row.sha256,
    storageKey: row.storage_key,
    durationSeconds: row.duration_s === null ? null : Number(row.duration_s),
    processingStatus: row.processing_status,
    createdAt: new Date(row.created_at),
  };
}

async function loadAttachment(db: Queryable, id: string, lock: boolean): Promise<AttachmentForProcessing | null> {
  const { rows } = await db.query<Row>(`SELECT ${COLUMNS} FROM attachments WHERE id = $1${lock ? " FOR UPDATE" : ""}`, [id]);
  return rows[0] ? toAttachment(rows[0]) : null;
}

export interface PgMediaUnitOfWorkOptions {
  /** Fila de indexação (`knowledge.index`, da ingestão), passada pela composição. */
  readonly indexQueue: string;
}

export function createPgMediaUnitOfWork(pool: Pool, queue: JobQueue, options: PgMediaUnitOfWorkOptions): MediaUnitOfWork {
  return {
    load: (id) => loadAttachment(pool, id, false),
    run: (work) =>
      withTransaction(pool, (client) => {
        const tx: MediaTx = {
          lockAttachment: (id) => loadAttachment(client, id, true),
          saveTranscript: (attachment, result) => saveTranscript(client, attachment, result),
          async markStatus(id, status, error) {
            await client.query(
              "UPDATE attachments SET processing_status = $2, processing_error = $3, updated_at = now() WHERE id = $1",
              [id, status, error ?? null],
            );
          },
          enqueueIndex: (job) =>
            queue.sendInTransaction(client, options.indexQueue, { ...job, reason: "transcribed" }, { singletonKey: `${job.messageId}:media` }),
        };
        return work(tx);
      }),
  };
}

/** Desativa a versão ativa (se houver) e grava a nova com os segmentos (RN-03: a anterior fica guardada). */
async function saveTranscript(db: Queryable, attachment: AttachmentForProcessing, result: ProcessorResult): Promise<void> {
  const t = result.transcript;
  await db.query("UPDATE transcripts SET is_active = false WHERE attachment_id = $1 AND is_active", [attachment.id]);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO transcripts (attachment_id, space_id, engine, model, model_version, language, text, empty, is_active, duration_s, rtf)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10) RETURNING id`,
    [
      attachment.id,
      attachment.spaceId,
      t.engine,
      t.model,
      t.modelVersion,
      t.language,
      t.text,
      result.status === "empty",
      t.durationSeconds ?? attachment.durationSeconds,
      t.rtf === null ? null : Math.round(t.rtf * 10_000) / 10_000,
    ],
  );
  const transcriptId = rows[0]?.id;
  if (!transcriptId || t.segments.length === 0) return;
  await db.query(
    `INSERT INTO transcript_segments (transcript_id, idx, start_s, end_s, text)
     SELECT $1, s.idx - 1, s.start_s, s.end_s, s.text
       FROM unnest($2::numeric[], $3::numeric[], $4::text[]) WITH ORDINALITY AS s(start_s, end_s, text, idx)`,
    [transcriptId, t.segments.map((s) => s.start), t.segments.map((s) => s.end), t.segments.map((s) => s.text)],
  );
}

export interface SweepPendingOptions {
  readonly mediaQueue: string;
  readonly kinds: readonly MediaKind[];
  readonly livePriority: number;
  readonly expireSeconds: (durationSeconds: number | undefined) => number;
}

/**
 * Republica anexos `pending` guardados que ficaram sem job (por exemplo, jobs expirados com a transcrição
 * desligada). Roda na partida do worker; devolve quantos republicou.
 */
export async function sweepPendingMedia(pool: Pool, queue: JobQueue, options: SweepPendingOptions): Promise<number> {
  const { rows } = await pool.query<{ id: string; space_id: string; duration_s: string | null; live: boolean }>(
    `SELECT a.id, a.space_id, a.duration_s,
            EXISTS (SELECT 1 FROM message_provenance p WHERE p.message_id = a.message_id AND p.capture_method = 'live') AS live
       FROM attachments a
      WHERE a.processing_status = 'pending' AND a.storage_status = 'stored' AND a.media_kind = ANY($2)
        AND NOT EXISTS (
          SELECT 1 FROM pgboss.job j
           WHERE j.name = $1 AND j.data->>'attachmentId' = a.id::text AND j.state IN ('created', 'retry', 'active'))
      ORDER BY a.created_at
      LIMIT 10000`,
    [options.mediaQueue, options.kinds],
  );
  for (const row of rows) {
    const duration = row.duration_s === null ? undefined : Number(row.duration_s);
    await queue.sendInTransaction(pool, options.mediaQueue, { attachmentId: row.id, spaceId: row.space_id }, {
      singletonKey: row.id,
      priority: row.live ? options.livePriority : 0,
      expireInSeconds: options.expireSeconds(duration),
    });
  }
  return rows.length;
}
