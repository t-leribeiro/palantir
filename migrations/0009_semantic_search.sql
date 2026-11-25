-- Up Migration
-- Busca pelo sentido (feature 007, data-delta.md). Os vetores ficam fora de message_chunks para que dois modelos
-- convivam durante uma troca (D-04); a cascata vem do trecho, então apagar mensagem ou fonte leva os vetores (RN-08).

-- Texto sem acento e em minúsculas para os trigramas (RF-04). O unaccent padrão não é imutável: o wrapper com o
-- dicionário explícito é o que permite usá-lo numa coluna gerada.
CREATE FUNCTION palantir_norm(t text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, t)) $$;

CREATE TABLE embedding_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  base_url text NOT NULL,
  dimensions integer NOT NULL CHECK (dimensions BETWEEN 1 AND 2000),
  query_prefix text NOT NULL DEFAULT '',
  document_prefix text NOT NULL DEFAULT '',
  min_similarity real NOT NULL CHECK (min_similarity BETWEEN 0 AND 1),
  status text NOT NULL CHECK (status IN ('building', 'active', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  retired_at timestamptz,
  UNIQUE (provider, model, base_url, dimensions, query_prefix, document_prefix)
);
-- Um só modelo ativo e uma só troca por vez (D-06).
CREATE UNIQUE INDEX embedding_models_one_active ON embedding_models (status) WHERE status = 'active';
CREATE UNIQUE INDEX embedding_models_one_building ON embedding_models (status) WHERE status = 'building';

CREATE TABLE chunk_embeddings (
  chunk_id uuid NOT NULL REFERENCES message_chunks (id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES embedding_models (id) ON DELETE CASCADE,
  space_id uuid NOT NULL,
  -- Sem dimensão fixa: o índice HNSW de cada modelo é parcial, com cast para a dimensão dele (criado na ativação).
  embedding vector NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, model_id)
);
CREATE INDEX chunk_embeddings_model_space ON chunk_embeddings (model_id, space_id);

ALTER TABLE message_chunks ADD COLUMN text_norm text GENERATED ALWAYS AS (palantir_norm(text)) STORED;
CREATE INDEX message_chunks_trgm ON message_chunks USING gin (text_norm gin_trgm_ops);

-- Down Migration
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT indexname FROM pg_indexes WHERE tablename = 'chunk_embeddings' AND indexname LIKE 'chunk_embeddings_hnsw_%' LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
  END LOOP;
END $$;
DROP INDEX IF EXISTS message_chunks_trgm;
ALTER TABLE message_chunks DROP COLUMN IF EXISTS text_norm;
DROP TABLE chunk_embeddings;
DROP TABLE embedding_models;
DROP FUNCTION palantir_norm(text);
