-- Up Migration
-- Mídia e transcrição (feature 005, data-delta.md).
-- Anexo comum a todos os tipos de mídia (RN-10): guardar e processar dependem só da política e do processador
-- registrado para o tipo. O binário fica cifrado no object storage, endereçado pelo conteúdo (D-04, D-05).
CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  space_id uuid NOT NULL,
  source_id uuid NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
  media_kind text NOT NULL CHECK (media_kind IN ('audio', 'image', 'document', 'video', 'other')),
  mime_type text NOT NULL,
  size_bytes bigint CHECK (size_bytes >= 0),
  sha256 text CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  storage_key text,
  duration_s numeric(10, 3) CHECK (duration_s >= 0),
  storage_status text NOT NULL CHECK (storage_status IN ('stored', 'unavailable')),
  unavailable_reason text CHECK (unavailable_reason IN ('missing_in_export', 'download_failed', 'too_large', 'expired', 'unsupported')),
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'done', 'empty', 'too_long', 'failed', 'not_applicable')),
  processing_error text CHECK (processing_error IN ('corrupted', 'engine_failed', 'timeout', 'unavailable')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((storage_status = 'stored') = (storage_key IS NOT NULL AND sha256 IS NOT NULL)),
  CHECK ((storage_status = 'unavailable') = (unavailable_reason IS NOT NULL))
);
CREATE UNIQUE INDEX attachments_one_per_message ON attachments (message_id);
-- Reconciliação de áudio ao vivo × importado (D-16) e deduplicação por conteúdo.
CREATE INDEX attachments_source_sha ON attachments (source_id, sha256) WHERE sha256 IS NOT NULL;
CREATE INDEX attachments_pending ON attachments (media_kind) WHERE processing_status = 'pending';

-- Transcrição versionada (RN-03, D-13): uma ativa por anexo; a anterior nunca é apagada.
CREATE TABLE transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id uuid NOT NULL REFERENCES attachments (id) ON DELETE CASCADE,
  space_id uuid NOT NULL,
  engine text NOT NULL,
  model text NOT NULL,
  model_version text NOT NULL,
  language text NOT NULL,
  text text NOT NULL,
  empty boolean NOT NULL,
  is_active boolean NOT NULL,
  duration_s numeric(10, 3) CHECK (duration_s >= 0),
  rtf numeric(8, 4) CHECK (rtf >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX transcripts_one_active ON transcripts (attachment_id) WHERE is_active;

CREATE TABLE transcript_segments (
  transcript_id uuid NOT NULL REFERENCES transcripts (id) ON DELETE CASCADE,
  idx integer NOT NULL CHECK (idx >= 0),
  start_s numeric(10, 3) NOT NULL CHECK (start_s >= 0),
  end_s numeric(10, 3) NOT NULL,
  text text NOT NULL,
  PRIMARY KEY (transcript_id, idx),
  CHECK (end_s >= start_s)
);

-- Trechos da transcrição guardam de onde saíram no áudio (D-14).
ALTER TABLE message_chunks
  ADD COLUMN audio_start_s numeric(10, 3),
  ADD COLUMN audio_end_s numeric(10, 3),
  ADD CONSTRAINT message_chunks_audio_range CHECK (
    (audio_start_s IS NULL AND audio_end_s IS NULL)
    OR (audio_start_s >= 0 AND audio_end_s >= audio_start_s)
  );

-- Down Migration
ALTER TABLE message_chunks DROP CONSTRAINT message_chunks_audio_range, DROP COLUMN audio_end_s, DROP COLUMN audio_start_s;
DROP TABLE transcript_segments;
DROP TABLE transcripts;
DROP TABLE attachments;
