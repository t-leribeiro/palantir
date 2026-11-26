# Data delta: Ver a mensagem original com contexto (fatia S7)

> Identificador: `008-mostrar-original-com-contexto`
> Data: `2026-11-25`
> Base: modelo das migrações 0001 a 0009 e adendos `001` a `007` (greenfield)

## 1. Tabela alterada: `agent_conversation_state` (migração `0010_show_source.sql`)

| Coluna | Tipo | Nulo | Descrição |
|--------|------|------|-----------|
| `citations` | `jsonb` | sim | Citações da última resposta `answered`: `[{ "index": 1, "messageId": "<uuid>", "kind": "text" \| "audio", "audioStartS"?: n, "audioEndS"?: n }]`, até 20 itens (limite do contrato). Só ids e números, nunca texto |
| `citations_at` | `timestamptz` | sim | Momento da resposta. A lista vale enquanto `now() - citations_at < 2 h` |

- Restrição: `CHECK (citations IS NULL OR jsonb_typeof(citations) = 'array')`.
- Gravação: `INSERT ... ON CONFLICT (user_id, provider) DO UPDATE SET citations = excluded.citations, citations_at = excluded.citations_at, updated_at = now()`. Assim a lista da S5 e a ação pendente não são tocadas.
- Exclusão de fonte (S5): a lista pode ficar com ids de mensagens apagadas. A leitura trata isso como `deleted` ou `not_found`, e não há conteúdo a limpar, porque só há ids.
- Volta atrás: `ALTER TABLE agent_conversation_state DROP COLUMN citations, DROP COLUMN citations_at`.

## 2. Leituras novas, sem mudança de schema

**Busca por contexto (`retrieval`, D-04):**
- **Alvo:** `messages m` com `participants`, `sources` e `attachments` (o primeiro anexo de áudio da mensagem), mais `transcripts` (`is_active`) e `transcript_segments`. Filtro: `m.id = $messageId AND m.space_id = $spaceId`.
- **Vizinhas:** duas consultas na mesma fonte, pelo índice `messages_source_sent_at (source_id, sent_at)`:
  - antes: `(sent_at, created_at, id) < ($sentAt, $createdAt, $id) ORDER BY sent_at DESC, created_at DESC, id DESC LIMIT 3`;
  - depois: `(sent_at, created_at, id) > ($sentAt, $createdAt, $id) ORDER BY sent_at, created_at, id LIMIT 3`.
  - No mesmo minuto, a ordem de gravação segue a do arquivo exportado.
- **Estado da fonte:** `sources.status = 'deleting'` devolve `deleted`; mensagem ausente devolve `not_found`.

**Arquivo do áudio (`media`, D-08):**
- `attachments` filtrado por `id = $ref AND space_id = $spaceId AND storage_status = 'stored'`, com `storage_key`, `mime_type`, `size_bytes` e `sha256`.
- O espaço vem da conta de canal de destino (`channel_accounts`, `status = 'active'`).

## 3. Volumes

- Uma linha por dono e canal; o `jsonb` tem até 20 itens pequenos.
- As consultas de contexto leem no máximo 7 mensagens e uma transcrição.

## 4. Dados existentes

Nenhuma migração de dados. As colunas nascem nulas.
