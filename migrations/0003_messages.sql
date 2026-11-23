-- Up Migration
CREATE TABLE participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
  external_id text NOT NULL,
  display_name text,
  UNIQUE (source_id, external_id)
);

CREATE TABLE messages (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES knowledge_spaces (id),
  source_id uuid NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
  external_message_id text,
  import_key text,
  kind text NOT NULL CHECK (kind IN ('text', 'audio', 'image', 'document', 'link')),
  text text,
  quoted_message_id uuid REFERENCES messages (id) ON DELETE SET NULL,
  is_forwarded boolean NOT NULL DEFAULT false,
  sent_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Idempotência da ingestão (RN-02).
CREATE UNIQUE INDEX messages_source_external_id ON messages (source_id, external_message_id) WHERE external_message_id IS NOT NULL;
CREATE UNIQUE INDEX messages_source_import_key ON messages (source_id, import_key) WHERE import_key IS NOT NULL;
CREATE INDEX messages_space_sent_at ON messages (space_id, sent_at DESC);

-- Mensagem original é evidência imutável (RN-03).
CREATE FUNCTION messages_forbid_content_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.text IS DISTINCT FROM OLD.text
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
     OR NEW.participant_id IS DISTINCT FROM OLD.participant_id
     OR NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.space_id IS DISTINCT FROM OLD.space_id THEN
    RAISE EXCEPTION 'messages são imutáveis: conteúdo, autor, data e origem não podem ser alterados'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER messages_immutable BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_forbid_content_update();

CREATE TABLE message_provenance (
  message_id uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  capture_method text NOT NULL CHECK (capture_method IN ('live', 'export_import', 'forwarded_to_agent')),
  adapter text NOT NULL,
  captured_at timestamptz NOT NULL,
  PRIMARY KEY (message_id, capture_method, adapter)
);

-- Down Migration
DROP TABLE message_provenance;
DROP TRIGGER messages_immutable ON messages;
DROP FUNCTION messages_forbid_content_update();
DROP TABLE messages;
DROP TABLE participants;
