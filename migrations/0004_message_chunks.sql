-- Up Migration
CREATE TABLE message_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,
  message_id uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  idx integer NOT NULL DEFAULT 0,
  text text NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('palantir_pt', text)) STORED,
  UNIQUE (message_id, idx)
);
CREATE INDEX message_chunks_tsv ON message_chunks USING gin (tsv);
CREATE INDEX message_chunks_space ON message_chunks (space_id, message_id);

-- Down Migration
DROP TABLE message_chunks;
