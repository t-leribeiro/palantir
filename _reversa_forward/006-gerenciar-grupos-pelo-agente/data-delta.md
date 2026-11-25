# Data delta: Gerenciar grupos conversando com o agente (fatia S5)

> Identificador: `006-gerenciar-grupos-pelo-agente`
> Data: `2026-11-24`
> Base: `_reversa_sdd/sdd/identity-and-sources.md#9. Modelo de Dados`, migrações `0002` a `0007` (adendos 001 a 005)

## Migração `0008_source_management.sql`

### Novas tabelas

**`channel_account_verifications`** (D-11): códigos de verificação de posse.

| Campo | Tipo | Regra |
|-------|------|-------|
| `id` | uuid PK | |
| `account_id` | uuid NOT NULL → `channel_accounts(id)` ON DELETE CASCADE | |
| `code_salt` | bytea NOT NULL | 16 bytes aleatórios |
| `code_hash` | bytea NOT NULL | SHA-256 de `salt ‖ código` |
| `expires_at` | timestamptz NOT NULL | criação + 10 min |
| `attempts` | integer NOT NULL DEFAULT 0 | CHECK 0 a 5 |
| `consumed_at` | timestamptz | preenchido ao verificar |
| `invalidated_at` | timestamptz | preenchido quando sai um código novo ou na 5ª tentativa errada |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

Índice único parcial: um código vivo por conta (`account_id` WHERE `consumed_at IS NULL AND invalidated_at IS NULL`).

**`agent_conversation_state`** (D-02): estado curto da conversa com o agente.

| Campo | Tipo | Regra |
|-------|------|-------|
| `user_id` | uuid → `users(id)` ON DELETE CASCADE | PK com `provider` |
| `provider` | text | |
| `listing` | jsonb | `[{ "ref": "source:<uuid>" \| "group:<id>", "title": "..." }]` da última lista, na ordem mostrada |
| `listing_page` | integer | página mostrada (30 por página) |
| `listing_at` | timestamptz | a lista vale até `listing_at + 30 min` |
| `pending` | jsonb | `{ "action": "follow" \| "delete", "ref": "...", "title": "..." }` |
| `pending_expires_at` | timestamptz | a ação pendente vale até aqui (5 min) |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | |

Os nomes ficam no estado porque a resposta e a confirmação os citam. São apagados quando expira o prazo ou quando a fonte é excluída: o job `sources.delete` limpa referências à fonte.

**`source_deletions`** (D-07, D-08): pedidos de exclusão.

| Campo | Tipo | Regra |
|-------|------|-------|
| `id` | uuid PK | também é o `singletonKey` dos jobs |
| `source_id` | uuid NOT NULL | **sem FK**: a fonte deixa de existir |
| `space_id` | uuid NOT NULL → `knowledge_spaces(id)` | |
| `requested_by` | uuid NOT NULL → `users(id)` | |
| `notify_provider` | text | canal de onde veio o pedido, ou nulo (terminal sem conta verificada) |
| `notify_account` | text | conta de destino do aviso |
| `notify_title` | text | nome da conversa, só para montar o aviso; vira NULL depois de mandar |
| `requested_at` | timestamptz NOT NULL DEFAULT now() | |
| `completed_at` | timestamptz | |
| `messages_deleted` | integer | contagem antes do `DELETE` |
| `audios_deleted` | integer | anexos `audio` guardados |
| `objects_deleted` | integer | objetos removidos do armazenamento |
| `notified_at` | timestamptz | reivindicação do aviso (D-10) |

Índice: (`completed_at`) WHERE `completed_at IS NULL`, para a métrica e o alerta de exclusão em andamento.

**`audit_events`** (D-13): auditoria sem conteúdo.

| Campo | Tipo | Regra |
|-------|------|-------|
| `id` | uuid PK | |
| `actor_user_id` | uuid → `users(id)` | nulo para ações do sistema (ex.: conclusão da exclusão) |
| `action` | text NOT NULL | CHECK em: `account.link_requested`, `account.verified`, `account.verification_locked`, `capture.authorized`, `capture.revoked`, `source.deletion_requested`, `source.deleted` |
| `target_kind` | text NOT NULL | `channel_account` ou `source` |
| `target_id` | uuid NOT NULL | sem FK |
| `channel` | text | `whatsapp`, `fake` ou `cli` |
| `details` | jsonb NOT NULL DEFAULT '{}' | só contagens e códigos de resultado; nunca nome, telefone ou texto |
| `at` | timestamptz NOT NULL DEFAULT now() | |

Índice: (`at` DESC).

### Alterações

- `channel_accounts`: `UPDATE ... SET status = 'pending' WHERE status = 'active' AND verified_at IS NULL AND provider <> 'fake'` (D-12, RF-15).
- `sources`: índice `sources_space (space_id)`, para o catálogo de nomes do espaço e a lista de gestão.

### Inalterado, mas agora usado

- `sources.status = 'deleting'`, que já existia desde a 0002, passa a ser escrito.
- As FKs com `ON DELETE CASCADE` de `participants`, `messages`, `message_provenance`, `message_chunks`, `attachments`, `transcripts`, `transcript_segments` e `source_captures` fazem a cascata do `DELETE FROM sources`.
- `source_captures.consent_statement` recebe a declaração fixa da D-05 quando a autorização vem do agente.

### Fora do banco

- Armazenamento de mídia (SeaweedFS): o prefixo `<space_id>/<source_id>/` é removido inteiro pelo job `sources.delete`.
- Filas do pg-boss: `sources.delete` (fila morta `sources.delete.dead`) e `agent.notify`.

### Descida

A descida remove as quatro tabelas e o índice. Ela não restaura o `active` das contas: basta repetir o `whatsapp:link`.

## Volume esperado

| Tabela | Linhas |
|--------|--------|
| `channel_account_verifications` | dezenas (uma por vínculo) |
| `agent_conversation_state` | uma por usuário e canal |
| `source_deletions` | uma por exclusão |
| `audit_events` | dezenas por mês |
