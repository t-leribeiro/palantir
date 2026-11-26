# Observações (2026-11-25, horário local salvo quando indicado UTC)

- Configuração: `PALANTIR_TRANSCRIBE_CONCURRENCY=1`; `media.process` com `retryLimit 3`, `retryDelay 10 s` com recuo.
- Motor: sem reinício desde 24/11 (`RestartCount = 0`, sem OOM).
- Jobs: os 36 criados às 10:17:47 (devolução à fila), todos com `retry_count = 3` ao final.
- Worker (Loki, `palantir-worker`, pid 13408, subiu às 10:29): 63 linhas "falha ao processar mídia; nova tentativa" entre 10:34:25 e 10:34:56, uma a cada ~0,5 s; 41 às 10:40; todas `TranscriberError`.
- Desfecho `failed`: 10 anexos às 10:40:46-10:40:59, 25 às 10:46:05-10:46:17, 1 às 11:03:10.
- Motor (Speaches, UTC): no intervalo 13:30-14:10, só as transcrições dos áudios de 7:15 e 7:40 aparecem; nenhuma das chamadas que falharam chega ao log.
- Motor (UTC 13:39-14:29): trechos de vários áudios processados intercalados ("Processing segment at" 06:23, 05:24, 02:51, 04:39...), com a concorrência do worker em 1.
- Duração dos 36 `failed`: < 120 s: 24; 120-209 s: 8; ≥ 210 s: 4.
