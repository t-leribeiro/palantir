# Data delta: Walking skeleton da platform-foundation

> Identificador: `001-walking-skeleton`
> Data: `2026-11-22`
> Base: modelos planejados em `_reversa_sdd/sdd/identity-and-sources.md#9`, `_reversa_sdd/sdd/ingestion.md#9`, `_reversa_sdd/sdd/knowledge-indexing.md#9`

Projeto novo: todo o esquema é criado por esta feature. As tabelas usam os nomes finais das specs e trazem só as colunas necessárias ao esqueleto; colunas futuras entram por migrações aditivas.

## 1. Extensões

| Extensão | Uso |
|----------|-----|
| `pgcrypto` | `gen_random_uuid()` |
| `unaccent` | FTS sem acentos |
| `pg_trgm` | Instalada agora, usada na feature de retrieval |
| `vector` | Instalada agora, usada na feature de embeddings |

Configuração de busca: `CREATE TEXT SEARCH CONFIGURATION palantir_pt (COPY = portuguese)` com `unaccent` antes do stemmer.

## 2. Tabelas novas

### users
| Coluna | Tipo | Regra |
|--------|------|-------|
| id | uuid PK | default `gen_random_uuid()` |
| display_name | text not null | |
| created_at | timestamptz not null | default `now()` |

### knowledge_spaces
| Coluna | Tipo | Regra |
|--------|------|-------|
| id | uuid PK | |
| owner_user_id | uuid not null FK users | |
| kind | text not null | check in (`personal`, `shared`) |
| retention_days | int null | |
| created_at | timestamptz not null | |

Índice único parcial: (`owner_user_id`) where `kind = 'personal'` (um espaço pessoal por usuário).

### channel_accounts
| Coluna | Tipo | Regra |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid not null FK users | |
| provider | text not null | texto livre (`fake`, `whatsapp`, ...) |
| external_account_id | text not null | |
| status | text not null | check in (`pending`, `active`, `revoked`) |
| verified_at | timestamptz null | |

Único: (`provider`, `external_account_id`).

### sources
| Coluna | Tipo | Regra |
|--------|------|-------|
| id | uuid PK | |
| space_id | uuid not null FK knowledge_spaces | |
| channel_account_id | uuid not null FK channel_accounts | |
| external_conversation_id | text not null | |
| title | text not null | |
| kind | text not null | check in (`group`, `direct`) |
| status | text not null | check in (`not_authorized`, `authorized`, `revoked`, `deleting`), default `not_authorized` |

Único: (`channel_account_id`, `external_conversation_id`).

### participants
| Coluna | Tipo | Regra |
|--------|------|-------|
| id | uuid PK | |
| source_id | uuid not null FK sources on delete cascade | |
| external_id | text not null | |
| display_name | text null | atualizado com o nome mais recente |

Único: (`source_id`, `external_id`).

### messages
| Coluna | Tipo | Regra |
|--------|------|-------|
| id | uuid PK | |
| space_id | uuid not null FK knowledge_spaces | redundante de propósito, para filtro de isolamento |
| source_id | uuid not null FK sources on delete cascade | |
| participant_id | uuid not null FK participants | |
| external_message_id | text null | |
| import_key | text null | preenchido pelo importador (feature futura) |
| kind | text not null | `text`, `audio`, `image`, `document`, `link` |
| text | text null | |
| quoted_message_id | uuid null FK messages | |
| is_forwarded | boolean not null default false | |
| sent_at | timestamptz not null | |
| created_at | timestamptz not null | |

Índices únicos parciais: (`source_id`, `external_message_id`) where `external_message_id is not null`; (`source_id`, `import_key`) where `import_key is not null`.
Imutabilidade: trigger `BEFORE UPDATE` que rejeita mudanças em `text`, `kind`, `sent_at`, `participant_id` e `source_id` (RN-03).

### message_provenance
| Coluna | Tipo | Regra |
|--------|------|-------|
| message_id | uuid FK messages on delete cascade | PK composta com `capture_method` e `adapter` |
| capture_method | text not null | check in (`live`, `export_import`, `forwarded_to_agent`) |
| adapter | text not null | ex.: `fake`, `baileys` |
| captured_at | timestamptz not null | |

### message_chunks
| Coluna | Tipo | Regra |
|--------|------|-------|
| id | uuid PK | |
| space_id | uuid not null | |
| message_id | uuid not null FK messages on delete cascade | |
| idx | int not null | 0 no esqueleto (um chunk por mensagem) |
| text | text not null | |
| tsv | tsvector generated always as (`to_tsvector('palantir_pt', text)`) stored | |

Índices: GIN em `tsv`; B-tree em (`space_id`, `message_id`). Único (`message_id`, `idx`).
Colunas futuras (feature de embeddings): `embedding vector(n)`, `embed_model`, `audio_start_s`, `audio_end_s`.

## 3. Schema gerenciado por biblioteca

- `pgboss.*`: criado pelo pg-boss na inicialização do worker. Não é editado pelas migrações da aplicação.

## 4. Fora deste delta (features seguintes)

`audit_events`, `channel_sessions`, `attachments`, `transcripts`, `transcript_segments`, `knowledge_items`, `evidence_references`, `themes`, `import_jobs`, `agent_sessions`, `agent_interaction_logs`.

## 5. Migrações

| Ordem | Migração | Reversível |
|-------|----------|-----------|
| 001 | extensões + configuração `palantir_pt` | sim |
| 002 | `users`, `knowledge_spaces`, `channel_accounts`, `sources` | sim |
| 003 | `participants`, `messages`, `message_provenance` + trigger de imutabilidade | sim |
| 004 | `message_chunks` + índices | sim |

## 6. Dados de seed (comando `seed`, idempotente)

- 1 `users` (`display_name = 'Operador'`)
- 1 `knowledge_spaces` (`kind = personal`)
- 1 `channel_accounts` (`provider = fake`, `external_account_id = 'fake-operator'`, `status = active`)
- 1 `sources` (`external_conversation_id = 'fake-group-1'`, `title = 'Grupo de teste'`, `kind = group`, `status = authorized`)
