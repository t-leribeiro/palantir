-- Up Migration
-- "mostra a N" (feature 008, data-delta.md §1): as citações da última resposta com citações, por dono e canal.
-- Só ids e a faixa do trecho de áudio, nunca texto (RN-08); valem 2 h a partir de citations_at (RN-01).
ALTER TABLE agent_conversation_state
  ADD COLUMN citations jsonb CHECK (citations IS NULL OR jsonb_typeof(citations) = 'array'),
  ADD COLUMN citations_at timestamptz;

-- Down Migration
ALTER TABLE agent_conversation_state DROP COLUMN citations, DROP COLUMN citations_at;
