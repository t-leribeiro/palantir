# Actions: Perguntar ao histórico importado (fatia S1)

> Identificador: `002-perguntar-historico-importado`
> Data: `2026-11-23`
> Roadmap: `_reversa_forward/002-perguntar-historico-importado/roadmap.md`

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de ações | 14 |
| Paralelizáveis (`[//]`) | 8 |
| Maior cadeia de dependência | 7 (T002 → T003 → T006 → T011 → T012 → T013 → T014) |

Prática: TDD. Os testes da Fase 2 vêm antes das implementações da Fase 3.

## Fase 1, Preparação

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T001 | Contrato 1.1.0: `source.importKey` (64 hex) obrigatório quando `captureMethod=export_import`, `CONTRACT_VERSION` 1.1.0, tipos regenerados e teste do validador para o novo caso | - | `[//]` | `contracts/channel/canonical-message.schema.json` | 🟢 | `[X]` |
| T002 | Criar as 4 amostras sintéticas (Android/iOS × pt-BR/en) com multilinha, sistema, mídia, mensagens iguais no mesmo minuto e datas ambíguas, e instalar `yauzl` e `yazl` (dev) | - | `[//]` | `test/fixtures/whatsapp-export/` | 🟡 | `[X]` |

## Fase 2, Testes

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T003 | Testes do parser: 4 formatos, multilinha, sistema ignorado, mídia contada, ordem de data (dmy, mdy, ambígua), formato não reconhecido acima de 5% | T002 | `[//]` | `test/unit/whatsapp-export/parse.test.ts` | 🟡 | `[X]` |
| T004 | Testes de fuso e chave de importação: conversão para UTC (São Paulo, UTC, Nova York), chave determinística, ordinal para mensagens iguais no mesmo minuto | - | `[//]` | `test/unit/whatsapp-export/keys.test.ts` | 🟢 | `[X]` |
| T005 | Testes da leitura de ZIP: `.zip` e `.txt` aceitos; recusa sem `.txt`, path traversal, compressão > 100:1 e tamanho > 2 GB (ZIPs gerados com `yazl` no próprio teste) | T002 | `[//]` | `test/unit/whatsapp-export/zip.test.ts` | 🟡 | `[X]` |

## Fase 3, Núcleo

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T006 | Implementar o parser de linhas (D-03, D-04, D-05), até T003 passar | T003 | - | `src/channels/whatsapp-export/parse.ts` | 🟡 | `[X]` |
| T007 | Implementar fuso e chave de importação (D-06, D-07), até T004 passar | T004 | `[//]` | `src/channels/whatsapp-export/keys.ts` | 🟢 | `[X]` |
| T008 | Implementar a leitura segura de ZIP/TXT em streaming (D-02), até T005 passar | T005 | `[//]` | `src/channels/whatsapp-export/zip.ts` | 🟡 | `[X]` |
| T009 | Ingestão deduplica por `import_key`: domínio leva `importKey` para `NewMessage` e o `PgMessageStore` escolhe o alvo do `ON CONFLICT` (D-09), com teste unitário e de integração | T001 | - | `src/modules/ingestion/` | 🟢 | `[X]` |
| T010 | Caso de uso `EnsureImportSource` no módulo `sources` (conta `whatsapp` `pending` + fonte autorizada, D-10) e repositório PostgreSQL, com testes unitário e de integração | - | `[//]` | `src/modules/sources/` | 🟢 | `[X]` |

## Fase 4, Integração

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T011 | Importador: arquivo → mensagens → `IngestMessage` → relatório (RF-09), recusando tudo em formato não reconhecido ou data ambígua; teste unitário com portas falsas | T006, T007, T008, T009, T010 | - | `src/channels/whatsapp-export/importer.ts` | 🟡 | `[X]` |
| T012 | Comando `npm run import` (`src/main/import.ts`) com as opções de `interfaces/import-cli.md` e resolução do dono (D-11) | T011 | - | `src/main/import.ts` | 🟢 | `[X]` |
| T013 | Teste E2E da S1: importar a amostra pt-BR, perguntar pelo canal de teste e receber a citação com autor, conversa e data; reimportar dá 0 novas; ZIP malicioso não grava nada; e medição de 10.000 mensagens em ≤ 2 min | T012 | - | `test/e2e/import-history.test.ts` | 🟡 | `[X]` |

## Fase 5, Polimento

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T014 | Atualizar `README.md` (comando de importação), `docs/plano-de-fatias.md` (S1 ✅ ao mergear) e ADR-0004 (contrato 1.1.0) | T013 | - | `docs/plano-de-fatias.md` | 🟢 | `[X]` |

## Notas de execução

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-23 | Versão inicial gerada por `/reversa-to-do` | reversa |
