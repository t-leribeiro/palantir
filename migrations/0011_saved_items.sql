-- Up Migration
-- Guardar com tema (feature 009, data-delta.md §2): a fonte Guardados de cada espaço, os temas, os itens guardados
-- e a evidência de cada item. O que espera pedido (até 10 min) não passa por aqui: fica só na memória (D-05).
ALTER TABLE sources DROP CONSTRAINT sources_kind_check;
ALTER TABLE sources ADD CONSTRAINT sources_kind_check CHECK (kind IN ('group', 'direct', 'saved'));
-- Uma fonte Guardados por espaço (D-08).
CREATE UNIQUE INDEX sources_one_saved_per_space ON sources (space_id) WHERE kind = 'saved';

-- RN-03: o nome mostrado é o da primeira vez; a comparação é pela forma normalizada.
CREATE TABLE themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES knowledge_spaces (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  normalized text NOT NULL CHECK (char_length(normalized) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (space_id, normalized)
);

CREATE TABLE knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES knowledge_spaces (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('saved', 'summary')),
  theme_id uuid REFERENCES themes (id) ON DELETE CASCADE,
  title text,
  note text CHECK (note IS NULL OR char_length(note) <= 2000),
  created_by text NOT NULL CHECK (created_by IN ('user', 'agent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'saved' OR theme_id IS NOT NULL)
);
CREATE INDEX knowledge_items_theme ON knowledge_items (space_id, theme_id, created_at DESC);

-- RN-05: todo item aponta para a mensagem que o sustenta.
CREATE TABLE evidence_references (
  knowledge_item_id uuid NOT NULL REFERENCES knowledge_items (id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  chunk_id uuid REFERENCES message_chunks (id) ON DELETE SET NULL,
  PRIMARY KEY (knowledge_item_id, message_id)
);
CREATE INDEX evidence_references_message ON evidence_references (message_id);

-- RN-05 e RN-10: item sem evidência e tema sem item não sobrevivem ("esquece a N" ou exclusão da fonte).
CREATE FUNCTION palantir_drop_orphan_items() RETURNS trigger AS $$
BEGIN
  DELETE FROM knowledge_items k WHERE k.id = OLD.knowledge_item_id
    AND NOT EXISTS (SELECT 1 FROM evidence_references e WHERE e.knowledge_item_id = k.id);
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER evidence_references_orphans AFTER DELETE ON evidence_references
  FOR EACH ROW EXECUTE FUNCTION palantir_drop_orphan_items();

CREATE FUNCTION palantir_drop_empty_themes() RETURNS trigger AS $$
BEGIN
  DELETE FROM themes t WHERE t.id = OLD.theme_id
    AND NOT EXISTS (SELECT 1 FROM knowledge_items k WHERE k.theme_id = t.id);
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER knowledge_items_empty_themes AFTER DELETE ON knowledge_items
  FOR EACH ROW EXECUTE FUNCTION palantir_drop_empty_themes();

-- D-17: auditoria de guardar e esquecer, com o id do item e sem tema nem conteúdo.
ALTER TABLE audit_events DROP CONSTRAINT audit_events_action_check;
ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action IN (
  'account.link_requested', 'account.verified', 'account.verification_locked',
  'capture.authorized', 'capture.revoked',
  'source.deletion_requested', 'source.deleted',
  'knowledge.item_saved', 'knowledge.item_forgotten'
));
ALTER TABLE audit_events DROP CONSTRAINT audit_events_target_kind_check;
ALTER TABLE audit_events ADD CONSTRAINT audit_events_target_kind_check
  CHECK (target_kind IN ('channel_account', 'source', 'knowledge_item'));

-- Down Migration
-- Falha se já houver fonte Guardados ou auditoria de itens: apague os Guardados antes de descer.
ALTER TABLE audit_events DROP CONSTRAINT audit_events_target_kind_check;
ALTER TABLE audit_events ADD CONSTRAINT audit_events_target_kind_check CHECK (target_kind IN ('channel_account', 'source'));
ALTER TABLE audit_events DROP CONSTRAINT audit_events_action_check;
ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action IN (
  'account.link_requested', 'account.verified', 'account.verification_locked',
  'capture.authorized', 'capture.revoked',
  'source.deletion_requested', 'source.deleted'
));
DROP TRIGGER knowledge_items_empty_themes ON knowledge_items;
DROP FUNCTION palantir_drop_empty_themes();
DROP TRIGGER evidence_references_orphans ON evidence_references;
DROP FUNCTION palantir_drop_orphan_items();
DROP TABLE evidence_references;
DROP TABLE knowledge_items;
DROP TABLE themes;
DROP INDEX sources_one_saved_per_space;
ALTER TABLE sources DROP CONSTRAINT sources_kind_check;
ALTER TABLE sources ADD CONSTRAINT sources_kind_check CHECK (kind IN ('group', 'direct'));
