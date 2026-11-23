# Data delta: Captura ao vivo de um grupo de teste autorizado (fatia S3)

> Identificador: `004-captura-ao-vivo-grupo-teste`
> Data: `2026-11-23`
> Base: modelo de `_reversa_sdd/sdd/ingestion.md#9`, `_reversa_sdd/sdd/identity-and-sources.md#9` e `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#9`, com os adendos 001, 002 e 003 (migrações `0001` a `0005`)

## Resumo

| Item | Tipo | Migração |
|------|------|----------|
| `source_captures` | tabela nova | `0006_live_capture.sql` |
| `whatsapp_groups` | tabela nova | `0006_live_capture.sql` |
| `messages (source_id, sent_at)` | índice novo | `0006_live_capture.sql` |
| `messages.import_key`, `messages.external_message_id` | uso novo (preenchidos na reconciliação quando nulos) | sem migração |
| `message_provenance` | uso novo (segunda proveniência na reconciliação) | sem migração |

Nenhum campo é removido nem muda de tipo.

## `source_captures` (identity-and-sources)

Autorização de captura de um grupo, com consentimento e histórico. É a trilha de auditoria pedida em `identity-and-sources.md#6` (RF-10) para autorizar e revogar.

| Coluna | Tipo | Regra |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `source_id` | uuid NOT NULL FK `sources(id)` ON DELETE CASCADE | Fonte onde as mensagens caem (nova ou `export:<nome>`) |
| `provider` | text NOT NULL | `whatsapp` |
| `group_id` | text NOT NULL | Id do grupo no WhatsApp (`<número>@g.us`) |
| `authorized_by` | uuid NOT NULL FK `users(id)` | Dono que autorizou (`--dono`) |
| `consent_statement` | text NOT NULL, `char_length` entre 10 e 500 | Declaração do operador (RN-02) |
| `authorized_at` | timestamptz NOT NULL DEFAULT now() | Também é o corte da D-13 |
| `revoked_at` | timestamptz NULL | Preenchido na revogação |

Índices:
- `UNIQUE (provider, group_id) WHERE revoked_at IS NULL`: no máximo uma captura ativa por grupo.
- `(source_id)`: para a listagem.

Revogar faz `UPDATE ... SET revoked_at = now()` na linha ativa. Reautorizar insere uma linha nova, e o histórico nunca é apagado (exceto em cascata, quando a fonte é excluída na S5).

## `whatsapp_groups` (adaptador WhatsApp, via porta)

Diretório dos grupos de que o número de captura participa, gravado pelo processo `dev:whatsapp` (D-07).

| Coluna | Tipo | Regra |
|--------|------|-------|
| `group_id` | text PK | `<número>@g.us` |
| `subject` | text NOT NULL | Nome do grupo |
| `participants` | integer NOT NULL | Quantidade, sem lista de pessoas |
| `seen_at` | timestamptz NOT NULL | Última vez que o número viu o grupo |
| `left_at` | timestamptz NULL | O número saiu ou foi removido do grupo |

A tabela não guarda participantes nem mensagens. A porta (`GroupDirectory`) é definida no módulo `sources`, e a implementação Postgres fica em `sources/infrastructure`.

## `messages`: índice e reconciliação

- Novo índice `messages_source_sent_at ON messages (source_id, sent_at)`: busca de candidatas em ±60 s (D-09).
- Na reconciliação importada → ao vivo, o `import_key` da mensagem ao vivo passa de nulo para a chave da importação. O índice único parcial `(source_id, import_key)` da S1 passa a deduplicar as próximas reimportações.
- Na reconciliação ao vivo → importada, o `external_message_id` da importada passa de nulo para o id do WhatsApp. O índice único parcial `(source_id, external_message_id)` passa a deduplicar as próximas reentregas.
- Conteúdo, autor e horário da mensagem nunca mudam. Isso preserva a RF-05 de `ingestion` (evidência imutável): só chaves nulas são preenchidas e proveniências são acrescentadas.

## `participants`

A estrutura não muda. Participante capturado ao vivo:
- `external_id` em E.164 (ou `lid:<id>`);
- `display_name` com o nome de perfil, ou o número mascarado quando não há nome.

O participante importado da mesma pessoa continua separado (`external_id` = nome normalizado do export). Unificar os dois fica fora desta fatia (NG-02 de `ingestion`).

## Migração

`migrations/0006_live_capture.sql`:
- **Up:** cria as duas tabelas e o índice.
- **Down:** remove o índice e as duas tabelas.

A migração não tem passo de dados: as tabelas nascem vazias e nenhuma mensagem existente muda.
