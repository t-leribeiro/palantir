# Interface: filas `sources.delete` e `agent.notify`

> Feature: `006-gerenciar-grupos-pelo-agente` · Decisões D-07, D-08, D-09, D-10, D-16
> Transporte: pg-boss no próprio Postgres, como `knowledge.index` e `media.process`.

## 1. `sources.delete`

**Publicação:** pelo outbox, na mesma transação que marca a fonte `deleting`, revoga a captura e insere em `source_deletions` e `audit_events`.

```json
{ "deletionId": "uuid", "sourceId": "uuid", "spaceId": "uuid" }
```

| Opção | Valor |
|-------|-------|
| `singletonKey` | `deletionId` |
| `retryLimit` | 12 |
| `retryDelay` / `retryBackoff` | 30 s, exponencial (cerca de 34 h no total) |
| `expireInSeconds` | 900 |
| fila morta | `sources.delete.dead` |
| consumidor | worker (`npm run dev:worker`), concorrência 1 |

**Passos, cada um idempotente:**

1. Carregar `source_deletions`. Se `completed_at` já estiver preenchido, terminar (reentrega).
2. Se a fonte ainda existir: contar as mensagens, os anexos de áudio guardados e os objetos, e gravar as contagens. Se não existir mais, manter as contagens já gravadas.
3. `MediaPurger.purgeSource(spaceId, sourceId)`: listar `<spaceId>/<sourceId>/` e apagar em lotes de até 1.000 chaves. Repetir até a listagem vir vazia.
4. `DELETE FROM sources WHERE id = $1`. A cascata leva participantes, mensagens, proveniência, trechos, anexos, transcrições, segmentos e capturas. Na mesma transação, apagar de `agent_conversation_state` as referências à fonte.
5. Numa transação: `completed_at = now()`, o evento de auditoria `source.deleted` (com as contagens) e o outbox `agent.notify`, se houver `notify_account`.

**Erros:**
- armazenamento fora do ar ou com timeout: o job falha, e o pg-boss tenta de novo com recuo;
- banco indisponível: idem;
- fila morta: a fonte continua `deleting` e fora das respostas; o alerta `SourceDeletionStalled` já terá disparado aos 30 min.

**Garantias:**
- Nenhuma mensagem nova da fonte é aceita desde a confirmação: ingestão e importação recusam `deleting`.
- Jobs `media.process` e `knowledge.index` da fonte que ainda estiverem na fila terminam como `skipped` (D-09).

## 2. `agent.notify`

**Publicação:** pelo outbox, no passo 5 de `sources.delete`.

```json
{ "kind": "source_deleted", "deletionId": "uuid" }
```

| Opção | Valor |
|-------|-------|
| `singletonKey` | `deletionId` |
| `retryLimit` | 5, com recuo exponencial a partir de 10 s |
| `expireInSeconds` | 120 |
| consumidor | o processo do canal do `notify_provider`: `whatsapp` no `npm run dev:whatsapp` (sempre com fila) e `fake` na API (canal de teste) |

**Passos:**

1. Reivindicar: `UPDATE source_deletions SET notified_at = now() WHERE id = $1 AND notified_at IS NULL RETURNING …`. Sem linha, terminar: o aviso já foi mandado.
2. Montar o `AgentReply` com o nome guardado no payload interno da exclusão e as contagens.
3. `channel.sendReply(notify_account, reply)`.
4. Se o envio falhar: voltar `notified_at` para nulo e relançar. O pg-boss tenta de novo.

**Privacidade:** o nome da conversa só aparece no texto do aviso para o próprio dono. Ele não vai para logs nem métricas. Para montar o aviso depois que a fonte foi apagada, o nome fica em `source_deletions.notify_title`. Depois do envio, o campo é limpo (`notify_title = NULL`).

## 3. Métricas (D-16)

| Métrica | Tipo | Rótulos |
|---------|------|---------|
| `palantir_source_deletions_in_progress` | gauge (consulta a `source_deletions` sem `completed_at`) | – |
| `palantir_source_deletion_oldest_seconds` | gauge | – |
| `palantir_source_deletion_seconds` | histogram (do pedido à conclusão) | – |
| `palantir_source_deletion_items_total` | counter | `kind` = `messages`, `audios`, `objects` |
| `palantir_agent_notifications_total` | counter | `kind`, `outcome` = `sent`, `failed`, `duplicate` |

Alerta `SourceDeletionStalled`: `palantir_source_deletion_oldest_seconds > 1800` por 5 min.
