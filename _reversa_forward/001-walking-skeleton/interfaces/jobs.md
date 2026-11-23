# Interface: jobs do walking skeleton

> Identificador: `001-walking-skeleton`
> Tipo: fila (pg-boss sobre PostgreSQL)

## knowledge.index

Publicado pela ingestão na mesma transação que grava a mensagem.

Payload:

```json
{ "messageId": "<uuid>", "spaceId": "<uuid>", "reason": "ingested" }
```

| Campo | Regra |
|-------|-------|
| messageId | mensagem existente |
| spaceId | igual ao `space_id` da mensagem; o worker confere e descarta se divergir |
| reason | `ingested` nesta feature; `transcribed` e `reindex` em features futuras |

Comportamento do consumidor:

- Cria ou substitui o chunk `idx = 0` de `message_chunks` com o texto da mensagem (idempotente: reprocessar o mesmo job não duplica).
- Mensagem sem texto: conclui sem criar chunk.
- Mensagem inexistente (fonte excluída): conclui sem erro.

Políticas:

| Item | Valor |
|------|-------|
| singletonKey | `messageId` (evita jobs duplicados pendentes) |
| retryLimit | 5 |
| retryBackoff | exponencial a partir de 2 s |
| expireIn | 60 s por execução |
| Dead letter | fila `knowledge.index.dead`, contada em `jobs_dead_total{queue}` |

Métricas: `jobs_completed_total{queue}`, `jobs_failed_total{queue}`, `job_duration_seconds{queue}` (histograma).
