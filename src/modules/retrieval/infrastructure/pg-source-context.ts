// Busca por contexto no PostgreSQL (feature 008, D-04, data-delta.md §2). As vizinhas usam o índice
// messages_source_sent_at; no mesmo minuto (o export só tem minuto), vale a ordem de gravação, que é a do arquivo.
// A posição da citada é lida no próprio SQL: o Date do JavaScript corta os microssegundos de created_at.
import type { Queryable } from "../../../platform/db/index.js";
import type { CitedMessage, ContextMessage, SourceAudio, SourceContext, SourceContextResult } from "../application/source-context.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O primeiro anexo de áudio da mensagem e a transcrição ativa dele. */
const AUDIO_JOIN = `
  LEFT JOIN LATERAL (
    SELECT a.id, a.mime_type, a.size_bytes, a.duration_s, a.storage_status, a.processing_status
      FROM attachments a WHERE a.message_id = m.id AND a.media_kind = 'audio' ORDER BY a.created_at, a.id LIMIT 1
  ) a ON true
  LEFT JOIN transcripts t ON t.attachment_id = a.id AND t.is_active`;

const TARGET = `
SELECT m.id, m.source_id, m.sent_at, m.kind, COALESCE(m.text, '') AS text,
       COALESCE(p.display_name, p.external_id) AS author, s.title AS source_title, s.status AS source_status,
       a.id AS attachment_id, a.mime_type, a.size_bytes, a.duration_s, a.storage_status, a.processing_status, t.id AS transcript_id
  FROM messages m
  JOIN participants p ON p.id = m.participant_id
  JOIN sources s ON s.id = m.source_id${AUDIO_JOIN}
 WHERE m.id = $1 AND m.space_id = $2`;

const NEIGHBOR_COLUMNS = `
SELECT m.id, m.sent_at, m.kind, COALESCE(NULLIF(m.text, ''), t.text, '') AS text,
       COALESCE(p.display_name, p.external_id) AS author, a.duration_s
  FROM messages m
  JOIN participants p ON p.id = m.participant_id${AUDIO_JOIN}
 WHERE m.source_id = $1 AND m.space_id = $2`;

const POSITION = "(SELECT c.sent_at, c.created_at, c.id FROM messages c WHERE c.id = $3)";
const BEFORE = `${NEIGHBOR_COLUMNS} AND (m.sent_at, m.created_at, m.id) < ${POSITION}
 ORDER BY m.sent_at DESC, m.created_at DESC, m.id DESC LIMIT $4`;
const AFTER = `${NEIGHBOR_COLUMNS} AND (m.sent_at, m.created_at, m.id) > ${POSITION}
 ORDER BY m.sent_at, m.created_at, m.id LIMIT $4`;

const SEGMENTS = "SELECT start_s, end_s, text FROM transcript_segments WHERE transcript_id = $1 ORDER BY idx";

interface TargetRow {
  id: string;
  source_id: string;
  sent_at: Date;
  kind: string;
  text: string;
  author: string;
  source_title: string;
  source_status: string;
  attachment_id: string | null;
  mime_type: string | null;
  size_bytes: string | number | null;
  duration_s: string | number | null;
  storage_status: string | null;
  processing_status: string | null;
  transcript_id: string | null;
}

interface NeighborRow {
  id: string;
  sent_at: Date;
  kind: string;
  text: string;
  author: string;
  duration_s: string | number | null;
}

const numberOrNull = (value: string | number | null): number | null => (value === null ? null : Number(value));

function neighbor(row: NeighborRow): ContextMessage {
  const duration = numberOrNull(row.duration_s);
  return { messageId: row.id, author: row.author, sentAt: new Date(row.sent_at), kind: row.kind, text: row.text, ...(duration === null ? {} : { durationSeconds: duration }) };
}

export function createPgSourceContext(db: Queryable): SourceContext {
  async function audioOf(row: TargetRow): Promise<SourceAudio | undefined> {
    if (!row.attachment_id) return undefined;
    const segments = row.transcript_id ? (await db.query<{ start_s: number; end_s: number; text: string }>(SEGMENTS, [row.transcript_id])).rows : [];
    return {
      attachmentId: row.attachment_id,
      mimeType: row.mime_type ?? "application/octet-stream",
      sizeBytes: numberOrNull(row.size_bytes),
      durationSeconds: numberOrNull(row.duration_s),
      stored: row.storage_status === "stored",
      processing: row.processing_status ?? "pending",
      segments: segments.map((s) => ({ start: Number(s.start_s), end: Number(s.end_s), text: s.text })),
    };
  }

  async function message(row: TargetRow): Promise<CitedMessage> {
    const audio = await audioOf(row);
    return {
      messageId: row.id,
      author: row.author,
      sourceTitle: row.source_title,
      sentAt: new Date(row.sent_at),
      kind: row.kind,
      text: row.text,
      ...(audio ? { audio } : {}),
    };
  }

  async function neighbors(sql: string, spaceId: string, row: TargetRow, k: number): Promise<ContextMessage[]> {
    const { rows } = await db.query<NeighborRow>(sql, [row.source_id, spaceId, row.id, k]);
    return rows.map(neighbor);
  }

  return {
    async around(spaceId, messageId, k): Promise<SourceContextResult> {
      if (!UUID.test(messageId)) return { status: "not_found" };
      const row = (await db.query<TargetRow>(TARGET, [messageId, spaceId])).rows[0];
      if (!row) return { status: "not_found" };
      if (row.source_status === "deleting") return { status: "deleted" };
      const [target, before, after] = await Promise.all([message(row), neighbors(BEFORE, spaceId, row, k), neighbors(AFTER, spaceId, row, k)]);
      return { status: "found", message: target, before: before.reverse(), after };
    },
  };
}
