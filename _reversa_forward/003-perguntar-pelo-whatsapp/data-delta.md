# Data delta: Perguntar pelo WhatsApp ao número do agente (S2)

> Base: `_reversa_sdd/sdd/identity-and-sources.md#9. Modelo de Dados`, `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#9. Modelo de Dados`, adendos `001` e `002`.

## 1. Tabela nova: `agent_inbound_receipts` (migração `0005`)

Recibo de cada mensagem dirigida ao agente, para não responder duas vezes à mesma pergunta (D-13). **Não guarda texto, número nem remetente** (RN-04 e privacidade).

| Coluna | Tipo | Regra |
|--------|------|-------|
| `provider` | `text` | `NOT NULL` (ex.: `whatsapp`) |
| `external_message_id` | `text` | `NOT NULL`, id da mensagem no provedor |
| `received_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

- Chave primária: (`provider`, `external_message_id`).
- Índice em `received_at` para a limpeza.
- Retenção: recibos com mais de 7 dias são apagados quando o processo do WhatsApp inicia.
- Down migration: `DROP TABLE agent_inbound_receipts`.

## 2. Mudança de dados (sem mudança de esquema): conta `whatsapp` do dono

O comando `whatsapp:link` altera a linha existente em `channel_accounts`:

| Campo | Antes (S1) | Depois (S2) |
|-------|------------|-------------|
| `external_account_id` | `unlinked:<user_id>` | número em E.164, ex. `+5511988887777` |
| `status` | `pending` | `active` |
| `verified_at` | `NULL` | continua `NULL`: cadastro pelo operador, sem código. A verificação pelo WhatsApp entra na S5 e preenche esse campo |

- A unicidade (`provider`, `external_account_id`) já existe e implementa RN-07; o conflito vira o erro `already_linked`, sem revelar o outro usuário.
- As linhas de `sources` continuam apontando para a mesma `channel_account_id`: as conversas importadas não mudam. `ensurePendingAccount` já procura a conta do usuário pelo provedor, então importações futuras usam a conta cadastrada.
- Recadastrar o mesmo número para o mesmo usuário não muda nada. Cadastrar outro número para o mesmo usuário troca o número da conta, com aviso no relatório do comando.
- Se o usuário não tiver conta `whatsapp`, o comando cria uma já `active`.

## 3. Fora do banco: sessão do WhatsApp

| Item | Valor |
|------|-------|
| Arquivo | `<PALANTIR_WA_SESSION_DIR>/agent-session.enc` (padrão `~/.palantir/whatsapp/`) |
| Conteúdo | credenciais e chaves do protocolo (todos os tipos de `SignalDataTypeMap`), serializados e criptografados |
| Formato | versão (1 byte) + nonce (12 bytes) + tag (16 bytes) + texto cifrado, AES-256-GCM |
| Chave | `PALANTIR_WA_SESSION_KEY` (32 bytes em base64) no `.env`, gerada pelo `npm run setup` se faltar |
| Ciclo de vida | sobrevive ao `teardown`; apagado em `logged_out`; chave trocada = novo pareamento |

O modelo `ChannelSession` da spec (tabela no banco) foi trocado por esse arquivo, por decisão do usuário em 2026-11-23 (`requirements.md#9. Esclarecimentos`).

## 4. Seed

Sem mudança. O operador do seed (`fake:fake-operator`) continua sendo o dono padrão do comando `whatsapp:link`.
