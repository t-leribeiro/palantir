# Observações (2026-11-25)

- Node 22.23.5, undici 6.29.1. Experimento na sessão: servidor que responde em 320 s, `fetch` com `AbortSignal.timeout(600_000)` falha aos 300 s com causa `UND_ERR_HEADERS_TIMEOUT`.
- Motor (log do Speaches, UTC): áudio de 7:15 começa às 13:35:03 e de novo às 13:41:09; áudio de 7:40 às 13:52:01 e às 13:58:09.
- Worker (pg-boss, horário local): tentativa iniciada às 10:41:00 termina às 10:46:05 (305 s); a de 10:58:03 termina às 11:03:10.
- Anexos `failed/unavailable` com 210 s ou mais: 4 (236, 361, 436 e 461 s).
