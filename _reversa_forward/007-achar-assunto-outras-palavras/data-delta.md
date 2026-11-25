# Data delta: Achar o mesmo assunto dito com outras palavras (fatia S6)

> Identificador: `007-achar-assunto-outras-palavras`
> Base: `_reversa_sdd/sdd/knowledge-indexing.md#9. Modelo de Dados`, `_reversa_sdd/sdd/retrieval.md#9. Modelo de Dados` e os adendos 001, 005 e 006
> Migração: `migrations/0009_semantic_search.sql`

## 1. Como está hoje

- `message_chunks` tem `id`, `space_id`, `message_id`, `idx`, `text`, `tsv` (gerada com `palantir_pt`), `audio_start_s` e `audio_end_s` (S4). A tabela cascateia da mensagem.
- As extensões `vector`, `pg_trgm` e `unaccent` estão instaladas desde a `0001` e ainda não têm uso.
- A spec previa `embedding vector(n)` e `embed_model` dentro de `MessageChunk`. Isso não foi implementado.

## 2. O que muda

### 2.1 Tabela nova `embedding_models`

Registra cada modelo de embeddings usado na instalação, com a configuração necessária para calcular o sentido da pergunta com o modelo ativo, mesmo durante uma troca.

| Campo | Tipo | Regra |
|-------|------|-------|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `provider` | `text` NOT NULL | `openai-compatible`, `voyage` ou `fake` |
| `model` | `text` NOT NULL | Nome do modelo no fornecedor (ex.: `bge-m3`) |
| `base_url` | `text` NOT NULL | Endereço do serviço. Não guarda segredo: a chave vem do ambiente |
| `dimensions` | `integer` NOT NULL | CHECK entre 1 e 2000 (limite do HNSW para `vector`) |
| `query_prefix` | `text` NOT NULL DEFAULT `''` | Prefixo da pergunta, para os modelos que pedem |
| `document_prefix` | `text` NOT NULL DEFAULT `''` | Prefixo do trecho |
| `min_similarity` | `real` NOT NULL | Limiar de sentido (D-08), sugerido pela medição; CHECK entre 0 e 1 |
| `status` | `text` NOT NULL | CHECK `building`, `active` ou `retired` |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `activated_at` | `timestamptz` | Preenchido na ativação |
| `retired_at` | `timestamptz` | Preenchido na aposentadoria |

Restrições:
- UNIQUE (`provider`, `model`, `base_url`, `dimensions`, `query_prefix`, `document_prefix`): a mesma configuração reaproveita o registro.
- Índice único parcial `embedding_models_one_active ON (status) WHERE status = 'active'`: um só modelo ativo.
- Índice único parcial `embedding_models_one_building ON (status) WHERE status = 'building'`: uma só troca por vez.

### 2.2 Tabela nova `chunk_embeddings`

| Campo | Tipo | Regra |
|-------|------|-------|
| `chunk_id` | `uuid` NOT NULL | FK `message_chunks(id)` ON DELETE CASCADE |
| `model_id` | `uuid` NOT NULL | FK `embedding_models(id)` ON DELETE CASCADE |
| `space_id` | `uuid` NOT NULL | Copiado do trecho, para filtrar antes de ordenar (RN-02) |
| `embedding` | `vector` NOT NULL | Sem dimensão fixa no tipo; a dimensão é conferida contra `embedding_models.dimensions` pelo adaptador antes de gravar (EC-05) |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

- PK (`chunk_id`, `model_id`).
- Índice `chunk_embeddings_model_space ON (model_id, space_id)`.
- "Pendente" é a ausência da linha (trecho sem vetor para o modelo ativo ou em construção). Não há coluna de estado.
- Reindexar a mensagem (`replaceChunks`) apaga e recria os trechos. A cascata leva os vetores, e o cálculo seguinte os refaz.
- Apagar uma fonte (S5) leva mensagens, trechos e vetores em cascata. Nenhuma limpeza extra.

### 2.3 Índice HNSW por modelo (criado na ativação, não na migração)

Na ativação de um modelo, a aplicação executa:

```sql
CREATE INDEX IF NOT EXISTS chunk_embeddings_hnsw_<id8>
  ON chunk_embeddings USING hnsw ((embedding::vector(<dimensions>)) vector_cosine_ops)
  WHERE model_id = '<model_id>';
```

- `<id8>` são os 8 primeiros caracteres hexadecimais do `model_id`, e `<dimensions>` é um inteiro validado: nada vem de texto livre.
- A consulta por sentido repete o mesmo cast e o mesmo `WHERE model_id = ...` para o planejador usar o índice.
- Na aposentadoria, o índice do modelo antigo é removido depois da limpeza dos vetores.
- Com 3.391 mensagens, a varredura completa já atende o prazo. O índice garante o RNF de 100.000 mensagens.

### 2.4 Texto normalizado para trigramas

```sql
CREATE FUNCTION palantir_norm(t text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, t)) $$;

ALTER TABLE message_chunks
  ADD COLUMN text_norm text GENERATED ALWAYS AS (palantir_norm(text)) STORED;

CREATE INDEX message_chunks_trgm ON message_chunks USING gin (text_norm gin_trgm_ops);
```

- O `unaccent` padrão não é imutável. O wrapper com o dicionário explícito é o caminho documentado para usá-lo numa coluna gerada.
- Adicionar a coluna gerada reescreve a tabela: 3.247 linhas hoje, segundos.

## 3. O que não muda

- `messages`, `attachments`, `transcripts` e `sources` não mudam.
- O `tsv` e a busca por palavra continuam como estão: são uma das três estratégias.
- O contrato do canal e o `AgentReply` não mudam.

## 4. Migração `0009_semantic_search.sql`

**Up:**
1. Criar a função `palantir_norm`.
2. Criar `embedding_models` e os dois índices únicos parciais.
3. Criar `chunk_embeddings`, com FKs e índice.
4. Adicionar `message_chunks.text_norm` e o índice GIN de trigramas.

**Down:**
1. Remover os índices HNSW dinâmicos: `DROP INDEX` para cada `chunk_embeddings_hnsw_%`, num bloco `DO`.
2. Remover `chunk_embeddings`, `embedding_models`, a coluna `text_norm` e o índice `message_chunks_trgm`.
3. Remover a função `palantir_norm`.

Sem migração de dados: o cálculo do histórico é feito pela varredura depois da subida (`roadmap.md#8`).

## 5. Verificações

- Teste de integração do esquema:
  - um ativo e um em construção, no máximo;
  - a dimensão fora de 1 a 2.000 é recusada;
  - apagar o trecho leva o vetor, e apagar a fonte leva tudo;
  - `text_norm` sem acento e em minúsculas.
- Teste de integração do índice: a ativação cria o índice parcial, e o `EXPLAIN` da consulta por sentido usa esse índice.
- Teste de isolamento: dois espaços com vetores iguais nunca cruzam resultados.
