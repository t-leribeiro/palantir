# ADR-0003: Fila de jobs no PostgreSQL com pg-boss (em vez de Redis/BullMQ)

- Status: aceito
- Data: 2026-11-22
- Decisores: Leandro (produto), reversa-plan
- Origem: `_reversa_forward/001-walking-skeleton/roadmap.md` (D-08), `investigation.md#2.1`

## Contexto

O requisito RF-10 da feature `001-walking-skeleton` exige que gravar a mensagem e disparar a indexação aconteçam juntos. A ideação sugeria BullMQ com Redis. A v0.1 é local-first, de custo baixo e de volume pessoal.

## Decisão

Fila de jobs com pg-boss no próprio PostgreSQL, atrás da porta `JobQueue` (`src/platform/queue`). A ingestão grava a mensagem e enfileira `knowledge.index` na mesma transação.

## Racional

1. **Atomicidade sem outbox.** Com Redis são dois sistemas: se o processo cair entre o commit no PostgreSQL e o envio ao Redis, a mensagem fica sem indexação (ou, na ordem inversa, o job aponta para uma mensagem inexistente). A correção padrão é o outbox transacional: tabela extra, processo relay e tratamento de duplicatas. Com a fila no PostgreSQL, o job entra no mesmo `COMMIT`.
2. **Menos infraestrutura.** Um serviço a menos para provisionar, monitorar, fazer backup e proteger (Local First, KISS, YAGNI, custo baixo).
3. **Volume da v0.1.** Uso pessoal, alguns grupos e importações pontuais.
4. **Troca contida.** A porta `JobQueue` isola a biblioteca; migrar altera só `src/platform/queue` e adiciona o outbox.

## Critérios objetivos de migração para Redis/BullMQ

Migrar quando qualquer um ocorrer:

1. O teste de carga de ingestão (`test/load/ingestion.load.ts`, ação T055) não atingir **≥ 200 mensagens/s**, ou a latência de enfileiramento P95 passar de **50 ms**.
2. For necessário **rate limit por destinatário** no envio do WhatsApp (1 msg/s, `_reversa_sdd/sdd/whatsapp-baileys-adapter.md` RF-10) e a solução com pg-boss exigir código próprio de controle.
3. Surgir uso de **cache ou estado compartilhado** (ex.: sessões do agente) que justifique o Redis por si só.

## Resultado do teste de carga

Medido em 2026-11-23 com `npm run test:load` (T055): 2.000 mensagens, PostgreSQL 16 em container (Docker Desktop, Windows 11, máquina de desenvolvimento do usuário), pool de 10 conexões. A latência é a da ingestão completa por mensagem: autorização da fonte, transação, gravação e enfileiramento.

| Concorrência | Vazão | Latência P95 | Jobs enfileirados | Dentro das metas |
|--------------|-------|--------------|-------------------|------------------|
| 5 | 301 msg/s | 23,9 ms | 2.000 de 2.000 | sim |
| 10 | 372 msg/s | 41,2 ms | 2.000 de 2.000 | sim |
| 20 | 363 msg/s | 92,5 ms | 2.000 de 2.000 | não (latência) |

Leitura: a vazão fica acima da meta em todos os níveis. Com concorrência 20, a latência sobe porque as requisições passam a esperar uma das 10 conexões do pool; a vazão não cai. O gargalo nesse caso é o tamanho do pool, não a fila. **Decisão: manter pg-boss.** Antes de qualquer migração para Redis, a primeira ação é ajustar o pool. O teste passa a usar concorrência 10 como padrão, igual ao tamanho do pool.

## Alternativas consideradas

- BullMQ + Redis + outbox: mais infraestrutura e código para a mesma garantia.
- Outbox com polling próprio: código a manter sem ganho.
