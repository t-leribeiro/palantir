-- Up Migration
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- Busca textual em português sem acentos (D-09/D-10).
CREATE TEXT SEARCH CONFIGURATION palantir_pt (COPY = portuguese);
ALTER TEXT SEARCH CONFIGURATION palantir_pt
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;

-- Down Migration
DROP TEXT SEARCH CONFIGURATION IF EXISTS palantir_pt;
DROP EXTENSION IF EXISTS vector;
DROP EXTENSION IF EXISTS pg_trgm;
DROP EXTENSION IF EXISTS unaccent;
DROP EXTENSION IF EXISTS pgcrypto;
