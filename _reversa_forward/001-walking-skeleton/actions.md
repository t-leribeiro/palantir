# Actions: Walking skeleton da platform-foundation

> Identificador: `001-walking-skeleton`
> Data: `2026-11-22`
> Roadmap: `_reversa_forward/001-walking-skeleton/roadmap.md`

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de ações | 56 |
| Paralelizáveis (`[//]`) | 37 |
| Maior cadeia de dependência | 10 (T003 → T018 → T019 → T020 → T025 → T033 → T040 → T044 → T051 → T053) |

Prática: TDD. A Fase 2 escreve os testes que falham antes do núcleo; cada ação do núcleo só fecha com os testes correspondentes verdes.

Pré-requisito de ambiente (ver `onboarding.md`): Node 22 ativo via nvm a partir de T003; Docker e Terraform a partir de T011 (execução) e T027/T028 (testes de integração e E2E).

## Fase 1, Preparação

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T001 | Escrever ADR-0001 (monólito modular e camadas), ADR-0002 (PostgreSQL como banco único; DynamoDB e MongoDB avaliados e descartados; critério de reavaliação), ADR-0003 (pg-boss em vez de Redis/BullMQ; critérios de migração para Redis) e ADR-0004 (contrato do canal schema-first), em formato MADR | - | `[//]` | `docs/adr/0001-0004-*.md` | 🟢 | `[X]` |
| T002 | Escrever ADR-0005 (testes de arquitetura e complexidade ≤ 10), ADR-0006 (IaC local com Terraform + Docker), ADR-0007 (resposta determinística atrás de `AnswerGenerator`) e ADR-0008 (Node 22 via nvm) e o índice `docs/adr/README.md` | - | `[//]` | `docs/adr/0005-0008-*.md` | 🟢 | `[X]` |
| T003 | Criar o esqueleto do pacote: `package.json` (`engines.node` 22, `type: module`, scripts), `.nvmrc`, `.npmrc` com `engine-strict=true`, `tsconfig.json` strict, `.gitignore`, `.editorconfig` | - | `[//]` | `package.json` | 🟢 | `[X]` |
| T004 | Implementar `npm run doctor`: verifica Node 22 ativo, Docker, Terraform ≥ 1.9, gitleaks e OSV-Scanner, com instrução de instalação para o que faltar | T003 | `[//]` | `scripts/doctor.mjs` | 🟢 | `[X]` |
| T005 | Configurar ESLint (typescript-eslint) com `complexity: ["error", 10]` e regra que exige justificativa em `eslint-disable` | T003 | `[//]` | `eslint.config.js` | 🟡 | `[X]` |
| T006 | Criar `quality/complexity-exceptions.json` (vazio), o script que falha quando um `eslint-disable-next-line complexity` não tem registro correspondente (arquivo, função, justificativa, revisor) e o relatório de complexidade média por módulo | T005 | - | `scripts/complexity.mjs` | 🟡 | `[X]` |
| T007 | Configurar dependency-cruiser com as 5 regras: `core-no-channels`, `domain-pure`, `application-no-infra`, `module-public-api-only`, `no-module-cycles` | T003 | `[//]` | `.dependency-cruiser.cjs` | 🟢 | `[X]` |
| T008 | Configurar Vitest com projetos `unit`, `integration`, `contract` e `e2e` e os scripts `test:*` | T003 | `[//]` | `vitest.config.ts` | 🟡 | `[X]` |
| T009 | Configurar StrykerJS (runner Vitest, modo incremental, escopo `src/modules/**/{domain,application}`, limiar 60%) | T008 | - | `stryker.config.mjs` | 🟡 | `[X]` |
| T010 | Configurar lefthook no pre-commit: ESLint nos staged, `tsc --noEmit`, dependency-cruiser, Vitest `--changed`, `gitleaks protect --staged` e o check de exceções de complexidade | T005, T006, T007, T008 | - | `lefthook.yml` | 🟡 | `[X]` |
| T011 | Criar módulos Terraform `postgres` (imagem pgvector pg16, volume, healthcheck) e `minio` (bucket privado), com provider `kreuzwerker/docker` | T003 | `[//]` | `infra/modules/{postgres,minio}/main.tf` | 🟢 | `[X]` |
| T012 | Criar módulo Terraform `observability` (OTel Collector, Prometheus, Tempo, Loki, Grafana) e os arquivos de configuração de cada serviço, com datasources do Grafana provisionados | T003 | `[//]` | `infra/modules/observability/main.tf` | 🟢 | `[X]` |
| T013 | Criar a raiz `infra/local` que compõe os módulos, gera credenciais locais (`random_password`), expõe outputs e os scripts `setup` e `teardown` | T011, T012 | - | `infra/local/main.tf` | 🟢 | `[X]` |
| T014 | Escrever as migrações 001 a 004 conforme `data-delta.md` (extensões e `palantir_pt`; identidade e fontes; mensagens, proveniência e trigger de imutabilidade; `message_chunks` e índices) com `down` | T003 | `[//]` | `migrations/` | 🟢 | `[X]` |
| T015 | Criar `.env.example` e o carregador de configuração validada (URLs do banco, MinIO, OTLP, `PALANTIR_ROLE`, `PALANTIR_FAKE_CHANNEL`, limiar de `low_confidence`) | T003 | `[//]` | `src/platform/config.ts` | 🟢 | `[X]` |
| T016 | Escrever os JSON Schemas `canonical-message.schema.json` e `agent-reply.schema.json` conforme `interfaces/channel-contract.md` | - | `[//]` | `contracts/channel/` | 🟢 | `[X]` |
| T017 | Escrever `contracts/openapi.yaml` (OpenAPI 3.1) conforme `interfaces/http-api.md`, referenciando os JSON Schemas do canal | T016 | - | `contracts/openapi.yaml` | 🟢 | `[X]` |
| T018 | Escrever o script de geração de tipos a partir dos JSON Schemas e o check de drift (`npm run contracts:check`) | T003, T016 | - | `scripts/contracts.mjs` | 🟢 | `[X]` |
| T019 | Gerar e versionar os tipos `CanonicalMessage` e `AgentReply` | T018 | - | `src/contracts/channel/generated.ts` | 🟢 | `[X]` |
| T020 | Definir a porta `KnowledgeChannel` e os tipos `ConversationRef`, `IngestOutcome` e `ChannelCapabilities` | T019 | - | `src/contracts/channel/knowledge-channel.ts` | 🟢 | `[X]` |

## Fase 2, Testes

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T021 | Escrever testes das 5 regras de arquitetura: para cada regra, uma fixture com import proibido que o dependency-cruiser deve rejeitar e uma fixture válida que deve passar | T007 | `[//]` | `test/architecture/rules.test.ts` | 🟢 | `[X]` |
| T022 | Escrever testes do gate de complexidade: função com complexidade 11 falha; com registro em `complexity-exceptions.json`, passa; `eslint-disable` sem registro falha | T006 | `[//]` | `test/quality/complexity.test.ts` | 🟡 | `[X]` |
| T023 | Escrever testes unitários do validador de contrato: mensagem válida passa; campo obrigatório ausente, `timestamp` sem fuso, `captureMethod` inválido e `contractVersion` 2.x são rejeitados com o caminho do campo | T019 | `[//]` | `test/unit/contracts/validator.test.ts` | 🟢 | `[X]` |
| T024 | Escrever a suíte reutilizável `runChannelContractSuite(factory)`: conexão, `listConversations`, recebimento em `onMessage`, separação de `onAgentMessage`, `sendReply`, reconexão simulada | T020 | `[//]` | `test/contract/channel-contract-suite.ts` | 🟢 | `[X]` |
| T025 | Escrever testes unitários do domínio e da aplicação de ingestão: rejeição de fonte não autorizada, decisão de duplicata por `externalMessageId`, gravação com proveniência e job na mesma unidade de trabalho | T020 | `[//]` | `test/unit/ingestion/ingest-message.test.ts` | 🟢 | `[X]` |
| T026 | Escrever testes unitários do agente: resposta com até 3 citações; `low_confidence` ou lista vazia gera "não encontrei evidências suficientes"; `CitationValidator` rejeita `messageId` fora dos resultados; conta não vinculada não chama a busca | T020 | `[//]` | `test/unit/agent/ask-question.test.ts` | 🟢 | `[X]` |
| T027 | Escrever testes de integração com Testcontainers (PostgreSQL real com as migrações): unicidade parcial de mensagens, trigger de imutabilidade, cascata ao excluir fonte, busca FTS com acentos e isolamento entre dois espaços | T014 | `[//]` | `test/integration/postgres.test.ts` | 🟢 | `[X]` |
| T028 | Escrever os testes E2E contra a API local: resposta com citação, "não encontrei evidências suficientes", mensagem triplicada vira 1, fonte não autorizada (403 e métrica), isolamento entre espaços, contrato inválido (400); espera da indexação por polling com timeout de 30 s | T017 | `[//]` | `test/e2e/walking-skeleton.test.ts` | 🟡 | `[X]` |

## Fase 3, Núcleo

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T029 | Criar o kernel compartilhado: ids (uuid), relógio injetável, tipo `Result` e erros de domínio | T003 | `[//]` | `src/shared/` | 🟢 | `[X]` |
| T030 | Implementar o validador de contrato com Ajv (cache de schemas compilados, códigos `contract.invalid` e `contract.version_unsupported`) até T023 passar | T019, T023 | `[//]` | `src/platform/contracts/validator.ts` | 🟢 | `[X]` |
| T031 | Implementar o módulo `identity` (domínio e aplicação): `User`, `KnowledgeSpace`, `ChannelAccount`, caso de uso `ResolveUserByChannelAccount` e as portas de repositório, com API pública em `index.ts` | T029 | `[//]` | `src/modules/identity/` | 🟢 | `[X]` |
| T032 | Implementar o módulo `sources` (domínio e aplicação): `Source` com status, caso de uso `IsSourceAuthorized` e a porta de repositório, com API pública em `index.ts` | T029 | `[//]` | `src/modules/sources/` | 🟢 | `[X]` |
| T033 | Implementar o módulo `ingestion` (domínio e aplicação): caso de uso `IngestMessage` com as portas `MessageRepository`, `UnitOfWork` e `JobQueue`, até T025 passar | T025, T031, T032 | - | `src/modules/ingestion/` | 🟢 | `[X]` |
| T034 | Implementar o módulo `knowledge` (domínio e aplicação): caso de uso `IndexMessage` (um chunk por mensagem, idempotente) e a porta `ChunkRepository` | T029 | `[//]` | `src/modules/knowledge/` | 🟡 | `[X]` |
| T035 | Implementar o módulo `retrieval` (domínio e aplicação): caso de uso `SearchEvidence` com `space_id` obrigatório, a porta `SearchIndex` e o cálculo de `low_confidence` pelo limiar configurado | T029 | `[//]` | `src/modules/retrieval/` | 🟡 | `[X]` |
| T036 | Implementar o módulo `agent` (domínio e aplicação): caso de uso `AskQuestion`, porta `AnswerGenerator`, `DeterministicAnswerGenerator` e `CitationValidator`, produzindo `AgentReply`, até T026 passar | T026, T031, T035 | - | `src/modules/agent/` | 🟢 | `[X]` |

## Fase 4, Integração

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T037 | Implementar a plataforma de banco: pool `pg`, `UnitOfWork` transacional e o runner de migrações (`npm run db:migrate`) | T014, T015 | - | `src/platform/db/` | 🟢 | `[X]` |
| T038 | Implementar `JobQueue` com pg-boss, com envio dentro da transação do `UnitOfWork`, `singletonKey`, retry, backoff e fila de mortos conforme `interfaces/jobs.md` | T037 | - | `src/platform/queue/` | 🟡 | `[X]` |
| T039 | Implementar os repositórios PostgreSQL de `identity` e `sources`, até os casos de identidade e fontes de T027 passarem | T027, T031, T032, T037 | `[//]` | `src/modules/{identity,sources}/infrastructure/` | 🟢 | `[X]` |
| T040 | Implementar os repositórios PostgreSQL de `ingestion` (mensagens, participantes, proveniência) com tratamento de violação de unicidade como duplicata | T027, T033, T037 | `[//]` | `src/modules/ingestion/infrastructure/` | 🟢 | `[X]` |
| T041 | Implementar o `ChunkRepository` e o `SearchIndex` FTS (`websearch_to_tsquery`, `ts_rank_cd`, filtro `space_id` na query), até os casos de busca e isolamento de T027 passarem | T027, T034, T035, T037 | `[//]` | `src/modules/{knowledge,retrieval}/infrastructure/` | 🟡 | `[X]` |
| T042 | Implementar o adaptador `channels/fake` (`KnowledgeChannel`, injeção de mensagens, registro de respostas), até a suíte T024 passar contra ele | T020, T024, T030 | - | `src/channels/fake/` | 🟢 | `[X]` |
| T043 | Implementar o servidor HTTP Fastify com `/health` e as rotas `/v1/channels/fake/*` validadas pelos schemas da OpenAPI, habilitadas só com `PALANTIR_FAKE_CHANNEL=true` | T017, T042 | - | `src/platform/http/` | 🟡 | `[X]` |
| T044 | Implementar a composição em `src/main/api.ts` e `src/main/worker.ts` (consumidor de `knowledge.index`), ligando portas às implementações, até os E2E de T028 passarem | T036, T038, T039, T040, T041, T043 | - | `src/main/` | 🟢 | `[X]` |
| T045 | Implementar o comando `npm run seed`, idempotente, conforme `data-delta.md#6` | T039 | `[//]` | `src/main/seed.ts` | 🟢 | `[X]` |
| T046 | Escrever o teste de conformidade que compara as rotas registradas no Fastify com `contracts/openapi.yaml` | T043 | `[//]` | `test/contract/openapi-conformance.test.ts` | 🟢 | `[X]` |
| T047 | Criar o workflow `pr.yml` do GitHub Actions com os jobs `static`, `unit`, `integration`, `contract`, `e2e` (sobe o ambiente com Terraform), `mutation` e `security` | T010, T013, T028 | - | `.github/workflows/pr.yml` | 🟡 | `[ ]` |
| T048 | Criar o script versionado que aplica a proteção da `main` via `gh api` (todos os checks de `pr.yml` obrigatórios e 1 aprovação) | T047 | `[//]` | `scripts/branch-protection.sh` | 🟡 | `[ ]` |
| T049 | Implementar `npm run security`: Semgrep via Docker, OSV-Scanner e gitleaks, falhando em achados críticos ou altos | T003 | `[//]` | `scripts/security.mjs` | 🟡 | `[X]` |
| T050 | Implementar `npm run dor`, que roda localmente todos os itens automáticos da DoR e imprime o resultado por item | T006, T009, T049 | - | `scripts/dor.mjs` | 🟡 | `[X]` |

## Fase 5, Polimento

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T051 | Implementar a telemetria OpenTelemetry (SDK, auto-instrumentação HTTP e `pg`, spans `agent.ask` e `retrieval.search`) e as métricas `ingestion_*_total`, `channel_invalid_messages_total` e `jobs_*` | T044 | - | `src/platform/telemetry/` | 🟢 | `[X]` |
| T052 | Implementar o logger pino JSON com `trace_id` e redação de campos de conteúdo, com teste que garante que o texto das mensagens não aparece nos logs | T015 | `[//]` | `src/platform/logging/` | 🟢 | `[X]` |
| T053 | Provisionar o dashboard "Palantír / Walking skeleton" no Grafana (ingeridas, rejeitadas, duplicadas, latência da pergunta, jobs) | T012, T051 | - | `infra/local/config/grafana/dashboards/walking-skeleton.json` | 🟡 | `[X]` |
| T054 | Criar o harness de avaliação: `eval/cases.json` com casos sintéticos (sem dados reais de terceiros) e `npm run eval`, que mede acertos, taxa de citação e taxa de "não encontrei" | T044 | `[//]` | `scripts/eval.ts` | 🟡 | `[X]` |
| T055 | Criar o teste de carga de ingestão (meta ≥ 200 msg/s) e registrar o resultado no ADR-0003, como insumo do critério de migração para Redis | T044 | `[//]` | `test/load/ingestion.load.ts` | 🟡 | `[X]` |
| T056 | Escrever o `README.md` do projeto com pré-requisitos (nvm, Docker, Terraform), comandos de setup, testes (inclusive como rodar um teste isolado), DoR e links para os ADRs | T044 | `[//]` | `README.md` | 🟢 | `[X]` |

## Notas de execução

- Rodada 1 do `/reversa-coding` (2026-11-22): 35 de 56 ações concluídas, só as que rodam com Node. As ações que dependem de Docker e Terraform (T011–T014, T027, T028, T037–T041, T044, T045, T047, T048, T051, T053–T056) ficaram pendentes por decisão do usuário até instalar Docker Desktop, Terraform, gitleaks e OSV-Scanner.
- T049 (`npm run security`) foi escrita e testada só no caminho de ferramenta ausente; fica `[ ]` até rodar com Semgrep, OSV-Scanner e gitleaks instalados.
- O Node 22 foi instalado via `nvm install 22` sem `nvm use`: a versão global do usuário continua 18. Os comandos usam o binário do 22 pelo caminho do nvm.
- Os hooks do lefthook ainda não foram instalados (`npm install --ignore-scripts`): instalar agora bloquearia todo commit, porque o hook de segredos falha fechado sem gitleaks. Rode `npx lefthook install` depois de instalar o gitleaks.
- Dependências fixadas com `npm install --before=2026-11-08` (versões publicadas há pelo menos duas semanas). TypeScript ficou na 5.9 porque o typescript-eslint ainda não suporta a 7.
- Fora do roadmap, acrescentei as regras `only-main-composes` e `platform-no-modules` no dependency-cruiser e a configuração `vitest.mutation.config.ts`, que restringe a mutação aos testes unitários.
- Medição nesta rodada: 95 testes passando, cobertura de linhas do núcleo em 100% (meta de 80%), mutation score em 91,96% (meta de 60%) e complexidade máxima 10.
- Rodada 2 do `/reversa-coding` (2026-11-23): mais 19 ações concluídas (54 de 56). T047 (`pr.yml`) e T048 (`branch-protection.sh`) estão escritos e validados localmente (YAML, sintaxe, URLs das ferramentas), mas ficam `[ ]` até rodarem no GitHub: isso exige push e permissão de admin, ações externas que dependem do usuário.
- Desvios desta rodada: (a) **SeaweedFS no lugar do MinIO**, porque a MinIO não publica mais imagens (ADR-0006); (b) a **busca passou a usar OU entre os termos** e o score virou a fração de termos presentes, ignorando palavras de pergunta como "quem" e "falou". O limiar de baixa confiança foi de 0,05 para 0,5. Motivo: o E (AND) original não achava "O Grafana Alloy…" a partir de "quem falou do Grafana Alloy?"; (c) override de `uuid` para 11.1.1 (vulnerabilidade alta via testcontainers); (d) `.gitleaks.toml` com allowlist do manifesto de hashes do Reversa.
- Medições: 95 testes rápidos, 12 de integração e 7 E2E passando; mutation score de 91,96%; avaliação com 32 perguntas: 96,9% de acertos, 100% das respostas citadas, 87,5% de "não encontrei" correto (falha: "Alguém testou o Cassandra?" casou "testou" com "Testamos"); carga: 372 msg/s e P95 de 41,2 ms com concorrência 10 (detalhe no ADR-0003).
- Documentar os comandos no `CLAUDE.md` e no `AGENTS.md` (seção "Estado atual", que hoje diz que não há código) significa modificar arquivos pré-existentes; não está nas ações e depende de pedido explícito do usuário ao final.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-22 | Versão inicial gerada por `/reversa-to-do` | reversa |
