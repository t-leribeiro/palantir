# Data delta: Perguntar sobre o que foi dito em áudios (fatia S4)

> Identificador: `005-perguntar-sobre-audios`
> Base: `_reversa_sdd/sdd/media-transcription.md#9`, `knowledge-indexing.md#9`, migrações 0001 a 0006
> Migração nova: `migrations/0007_media.sql` (só cria; reversível)

## 1. Tabelas novas

### `attachments`
Um anexo por mensagem, comum a todos os tipos de mídia (RN-10, RF-15).

| Coluna | Tipo | Regra |
|--------|------|-------|
| `id` | uuid PK | |
| `message_id` | uuid NOT NULL → `messages(id)` ON DELETE CASCADE | |
| `space_id` | uuid NOT NULL | igual ao da mensagem (filtro de acesso) |
| `source_id` | uuid NOT NULL → `sources(id)` ON DELETE CASCADE | |
| `media_kind` | text NOT NULL CHECK in (`audio`, `image`, `document`, `video`, `other`) | escolhe o processador |
| `mime_type` | text NOT NULL | |
| `size_bytes` | bigint NULL | |
| `sha256` | text NULL CHECK `~ '^[0-9a-f]{64}$'` | do binário em claro; nulo se indisponível |
| `storage_key` | text NULL | `<space>/<source>/<sha256>`; nulo se não guardado |
| `duration_s` | numeric(10,3) NULL | do Ogg, do provedor ou do motor |
| `storage_status` | text NOT NULL CHECK in (`stored`, `unavailable`) | |
| `unavailable_reason` | text NULL CHECK in (`missing_in_export`, `download_failed`, `too_large`) | |
| `processing_status` | text NOT NULL DEFAULT `pending` CHECK in (`pending`, `done`, `empty`, `too_long`, `failed`, `not_applicable`) | `not_applicable` quando o tipo não tem processador |
| `processing_error` | text NULL CHECK in (`corrupted`, `engine_failed`, `timeout`) | sem texto livre |
| `created_at`, `updated_at` | timestamptz NOT NULL DEFAULT now() | |

Índices:
- `UNIQUE (message_id)`: um anexo por mensagem nesta fatia. O WhatsApp manda um arquivo por mensagem.
- `attachments_source_sha (source_id, sha256) WHERE sha256 IS NOT NULL`: para a reconciliação de áudio (D-16) e a deduplicação.
- `attachments_processing (processing_status) WHERE processing_status = 'pending'`: para o painel da fila.

### `transcripts`

| Coluna | Tipo | Regra |
|--------|------|-------|
| `id` | uuid PK | |
| `attachment_id` | uuid NOT NULL → `attachments(id)` ON DELETE CASCADE | |
| `space_id` | uuid NOT NULL | |
| `engine` | text NOT NULL | ex.: `openai-compatible:speaches` |
| `model` | text NOT NULL | ex.: `Systran/faster-whisper-small` |
| `model_version` | text NOT NULL | revisão informada ou `unknown` |
| `language` | text NOT NULL | código ISO 639-1 |
| `text` | text NOT NULL | pode ser vazio quando `empty` |
| `empty` | boolean NOT NULL | |
| `is_active` | boolean NOT NULL | |
| `duration_s` | numeric(10,3) NULL | |
| `rtf` | numeric(8,4) NULL | fator de tempo real medido |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

Índice: `UNIQUE (attachment_id) WHERE is_active`, que garante uma versão ativa (RN-03).

### `transcript_segments`

| Coluna | Tipo | Regra |
|--------|------|-------|
| `transcript_id` | uuid NOT NULL → `transcripts(id)` ON DELETE CASCADE | |
| `idx` | integer NOT NULL | PK (`transcript_id`, `idx`) |
| `start_s` | numeric(10,3) NOT NULL | |
| `end_s` | numeric(10,3) NOT NULL CHECK `end_s >= start_s` | |
| `text` | text NOT NULL | |

## 2. Colunas novas

### `message_chunks`

| Coluna | Tipo | Regra |
|--------|------|-------|
| `audio_start_s` | numeric(10,3) NULL | início do bloco no áudio (D-14) |
| `audio_end_s` | numeric(10,3) NULL | fim do bloco |
| CHECK | | as duas nulas, ou `audio_end_s >= audio_start_s` |

## 3. Sem mudança

- **`messages`:** já aceita `kind = 'audio'` e `text` nulo. A imutabilidade (trigger da 0003) continua: a transcrição nunca toca a mensagem.
- **`message_provenance`:** a reconciliação de áudio acrescenta a proveniência como na S3.
- **`source_captures`, `whatsapp_groups` e `agent_inbound_receipts`:** sem mudança.

## 4. Diff conceitual sobre a spec

| Spec (`media-transcription.md#9`) | Esta fatia | Motivo |
|-----------------------------------|------------|--------|
| Chave do objeto `space/source/message/attachment` | `space/source/sha256` | Endereçamento pelo conteúdo (D-04) |
| `Attachment.transcription_status` (`pending`, `done`, `too_long`, `failed`) | `processing_status` genérico, com `empty` e `not_applicable` | Serve a qualquer processador (RN-10) |
| `Transcript.model`, `model_version` | Mais `engine`, `duration_s` e `rtf` | Motor substituível (RN-03) e medição |

## 5. Dados existentes

As mensagens já importadas não mudam. A reimportação cria só as mensagens de áudio, com chaves novas sobre o nome do arquivo de referência (D-17). Não há backfill.

## 6. Rollback

O `down` da 0007 remove as colunas de `message_chunks` e as três tabelas, na ordem inversa. Os objetos no bucket ficam órfãos e cifrados. Removê-los é manual, com o bucket local.
