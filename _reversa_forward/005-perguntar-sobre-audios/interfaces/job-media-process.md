# Interface: job `media.process` (pg-boss)

> Feature `005-perguntar-sobre-audios` · D-12 e D-13 do roadmap · ADR-0003 (fila no PostgreSQL)

## 1. Publicação

A ingestão publica o job na mesma transação em que grava a mensagem e o anexo (outbox), só quando:
- `storage_status = 'stored'`;
- o tipo do anexo tem processador registrado (nesta fatia, só `audio`).

Nos demais casos, `processing_status` já nasce `not_applicable`.

```json
{ "attachmentId": "uuid", "spaceId": "uuid" }
```

| Opção pg-boss | Valor |
|---------------|-------|
| `priority` | `10` para `captureMethod = live`, `0` para `export_import` |
| `retryLimit` | `3` |
| `retryDelay` / `retryBackoff` | `10` s, com backoff |
| `expireInSeconds` | o maior entre 120 e 3 × `duration_s` (padrão 600 sem duração) |
| `singletonKey` | `attachmentId`, para não haver dois jobs do mesmo anexo na fila |

Nenhum dado pessoal vai no payload: só os dois ids.

## 2. Consumo (worker)

O worker assina com `localConcurrency = PALANTIR_TRANSCRIBE_CONCURRENCY` quando `PALANTIR_TRANSCRIPTION=on`. Para cada job:

1. Carregar o anexo. Se não existir ou o espaço for diferente: concluir como `skipped`, sem erro.
2. Se `processing_status` não for `pending`: concluir (idempotente).
3. Se `duration_s` > 3.600: gravar `too_long` e concluir, sem nova tentativa.
4. Ler o objeto, decifrar e conferir o SHA-256. Se o hash divergir, gravar `failed`/`corrupted`.
5. Chamar o processador do tipo; para áudio, o `Transcriber`.
6. Numa transação:
   - gravar a `transcripts` nova como ativa e desativar a anterior;
   - gravar os `transcript_segments`;
   - marcar o anexo `done` ou `empty`;
   - publicar `knowledge.index` da mensagem quando o resultado não for `empty`.
7. Erros:
   - `corrupted`: grava `failed`/`corrupted` e conclui o job;
   - `engine_failed`, `timeout` ou `unavailable`: lança para o pg-boss tentar de novo. Na última tentativa, grava `failed` com o motivo.

## 3. Garantias

- **Pelo menos uma vez:** um job repetido não duplica, pela checagem do passo 2 e pelo índice de uma transcrição ativa por anexo.
- **Prioridade:** um job `live` publicado depois de N jobs `export_import` pendentes é entregue antes deles.
- **Desligado:** com `PALANTIR_TRANSCRIPTION=off`, os jobs ficam na fila e os anexos continuam `pending`. Ao religar, a fila retoma. Jobs expirados enquanto o worker estava desligado são republicados por uma varredura na partida, que encontra os anexos `pending` sem job.

## 4. Métricas e trace

| Métrica | Tipo | Rótulos |
|---------|------|---------|
| `media_processed_total` | contador | `kind`, `outcome` (`done`, `empty`, `too_long`, `failed`) |
| `media_failed_total` | contador | `kind`, `reason` (`corrupted`, `engine_failed`, `timeout`, `unavailable`) |
| `media_queue_size` | gauge | `kind` |
| `transcription_rtf` | histograma | `model` |
| `transcription_latency_seconds` | histograma | `capture_method` |
| `transcriber_up` | gauge | `engine` |

Trace `media.process`: atributos `media.kind`, `transcriber.engine`, `transcriber.model`, `audio.duration_s` e `outcome`. Nunca texto.
