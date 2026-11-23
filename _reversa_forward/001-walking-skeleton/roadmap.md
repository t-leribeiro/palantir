# Roadmap: Walking skeleton da platform-foundation

> Identificador: `001-walking-skeleton`
> Data: `2026-11-22`
> Requirements: `_reversa_forward/001-walking-skeleton/requirements.md`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA

## 1. Resumo da abordagem

Projeto greenfield: o "legado" são as specs 🟡 em `_reversa_sdd/sdd/`, e esta feature cria o repositório do zero. Um único pacote TypeScript (Node.js 22 LTS) organizado como monólito modular, com um processo `api` (HTTP) e um processo `worker` (jobs) no mesmo código. O contrato do canal nasce primeiro como JSON Schema versionado em `contracts/`, com tipos TypeScript gerados e verificados contra drift. O ambiente local (PostgreSQL com pgvector/pg_trgm, MinIO, OpenTelemetry Collector, Prometheus, Tempo, Loki e Grafana) é provisionado por Terraform usando o provider Docker. A fila de jobs roda no próprio PostgreSQL (pg-boss), o que permite gravar a mensagem e enfileirar a indexação na mesma transação sem tabela de outbox. A busca do esqueleto é textual (FTS em português com `unaccent`), e a resposta do agente é composta de forma determinística atrás da porta `AnswerGenerator`. Os gates (arquitetura, complexidade, tipos, testes, segredos) rodam no pre-commit (lefthook) e, completos, no GitHub Actions, com a DoR aplicada pela proteção da branch `main`.

## 2. Princípios aplicados

`.reversa/principles.md` não existe. Os requisitos de engenharia da raiz (`requirements.md`) foram tratados como princípios de fato:

| Princípio | Como a feature se relaciona | Status |
|-----------|------------------------------|--------|
| Documentation First / API First | Contrato JSON Schema e OpenAPI escritos antes do código (D-05, D-06); ADRs para decisões estruturais | respeita |
| Security First | gitleaks no hook, Semgrep e OSV-Scanner na CI, segredos só por env, logs sem conteúdo | respeita |
| Local First | Tudo roda local via Terraform + Docker; nenhum serviço pago | respeita |
| TDD | Cada ação do `actions.md` começa pelo teste que falha | respeita |
| SOLID / Clean Arch | Camadas domínio/aplicação/infraestrutura por módulo, portas na aplicação, composição em `src/main` | respeita |
| KISS / YAGNI | Um pacote só, fila no Postgres, sem embeddings, sem LLM, sem Redis nesta feature | respeita |
| DRY | Tipos gerados do JSON Schema; suíte de contrato reutilizável | respeita |
| Pirâmide de testes | Unitário, integração (Testcontainers), contrato, mutação (Stryker), E2E | respeita |
| Pre-commit hooks | lefthook com lint, tipos, arquitetura, unitários afetados, gitleaks | respeita |
| IaC Terraform | Ambiente local em Terraform (provider Docker) | respeita |
| Observability | OTel → Collector → Tempo/Prometheus/Loki → Grafana provisionado | respeita |
| DoR | Checks obrigatórios + 1 review via branch protection | respeita |

## 3. Decisões técnicas

| ID | Decisão | Justificativa | Alternativas descartadas | Confidência |
|----|---------|----------------|--------------------------|-------------|
| D-01 | TypeScript `strict` sobre Node.js 22 LTS, instalado e selecionado via nvm (o usuário mantém outros projetos com outras versões), fixado em `.nvmrc` e em `engines` com `engine-strict=true` no `.npmrc`; `npm run doctor` falha se a versão ativa não for 22 | Esclarecimento de 2026-11-22; a máquina tem Node 18 (fora de suporte) usado por outros projetos, que não pode ser substituído globalmente | Node 18 (EOL), Node 24 (ainda novo para parte do ecossistema), instalação global sem gerenciador de versões | 🟢 |
| D-02 | Pacote único com `src/modules/<módulo>/{domain,application,infrastructure}`, `src/channels/<adaptador>`, `src/platform` (db, fila, telemetria, http) e `src/main` (composição) | Monólito modular (`_reversa_sdd/sdd/platform-foundation.md#RF-03`) com o menor custo de tooling | Monorepo com workspaces (custo sem ganho na v0.1) | 🟢 |
| D-03 | Processos `api` e `worker` a partir do mesmo build, escolhidos por `PALANTIR_ROLE` | Workers separados do HTTP sem dois projetos | Um processo só (mistura carga), serviços separados (YAGNI) | 🟡 |
| D-04 | HTTP com Fastify, rotas validadas pelos schemas da OpenAPI 3.1 em `contracts/openapi.yaml` | API first verificável: teste compara rotas registradas com a spec | Express (sem validação nativa por schema) | 🟡 |
| D-05 | Contrato do canal como JSON Schema 2020-12 em `contracts/channel/`, validação com Ajv, tipos gerados por `json-schema-to-typescript` e checados contra drift na CI | Fonte única de verdade, RF-06 | Tipos escritos à mão (drift), Zod como fonte (menos neutro para outros adaptadores) | 🟢 |
| D-06 | PostgreSQL 16 (imagem `pgvector/pgvector:pg16`) com `pg_trgm`, `unaccent` e FTS `portuguese`; acesso com `pg` e SQL explícito nos repositórios de infraestrutura | Restrição do PRD; vetores ficam prontos para a próxima feature | ORM completo (oculta SQL de busca), banco vetorial separado | 🟢 |
| D-07 | Migrações SQL versionadas com `node-pg-migrate` | Simples, SQL puro, reversível | Prisma Migrate (acopla ao ORM) | 🟡 |
| D-08 | Fila de jobs com pg-boss no próprio PostgreSQL, atrás da porta `JobQueue`; ingestão grava a mensagem e enfileira `knowledge.index` na mesma transação | Atende RF-10 sem tabela de outbox e sem Redis; resolve OQ-02 de `_reversa_sdd/sdd/ingestion.md`; a porta deixa a troca por BullMQ contida na infraestrutura (racional completo em `investigation.md#2.1`) | BullMQ + Redis + outbox (mais infraestrutura) | 🟡 |
| D-09 | Índice do esqueleto: tabela `message_chunks` com um chunk por mensagem e coluna `tsv` (FTS `portuguese` + `unaccent`), sem coluna de embedding ainda | Forma final de `_reversa_sdd/sdd/knowledge-indexing.md#9`, só sem vetor | Índice direto em `messages` (precisaria migrar depois) | 🟡 |
| D-10 | Busca: `ts_rank_cd` com `websearch_to_tsquery`, filtro `space_id` dentro da query; `low_confidence` quando não há resultado ou o melhor rank < limiar configurável (padrão 0,05) | RF-12; limiar ajustável no harness | Busca por trigramas já no esqueleto (fica para a feature de retrieval) | 🟡 |
| D-11 | Porta `AnswerGenerator` com implementação `DeterministicAnswerGenerator`: lista até 3 evidências com autor, fonte e data; sem resultados ou com `low_confidence`, responde "não encontrei evidências suficientes"; `CitationValidator` confere cada citação contra os resultados | Esclarecimento de 2026-11-22; E2E estável | LLM local ou pago no esqueleto | 🟢 |
| D-12 | Adaptador `channels/fake` com injeção por HTTP (habilitado só quando `PALANTIR_FAKE_CHANNEL=true`) e registro das respostas enviadas em memória e consultável | RF-07; operador e E2E usam o mesmo caminho | Injeção só por código de teste (operador não consegue testar) | 🟡 |
| D-13 | Suíte de contrato como função `runChannelContractSuite(factory)` em `test/contract/`, executada contra o adaptador fake | RF-08; reutilizável pelo adaptador Baileys | Testes duplicados por adaptador | 🟢 |
| D-14 | Testes: Vitest para unitário, integração e E2E; Testcontainers para integração com PostgreSQL real; StrykerJS (runner Vitest, modo incremental) para mutação | RF-19; uma ferramenta de teste só | Jest (mais lento com ESM/TS) | 🟡 |
| D-15 | Testes de arquitetura com dependency-cruiser: 5 regras do RF-03 (`core-no-channels`, `domain-pure`, `application-no-infra`, `module-public-api-only`, `no-module-cycles`), cada uma com fixture de violação testada | RF-03 / RNF-05 | ts-arch, ESLint `import/no-restricted-paths` (cobertura parcial de ciclos) | 🟢 |
| D-16 | Complexidade com ESLint `complexity: ["error", 10]`; exceções só via `eslint-disable-next-line complexity -- <justificativa>` e um script que exige registro correspondente em `quality/complexity-exceptions.json` (arquivo, função, justificativa, revisor); relatório de média por módulo gerado do ESLint em JSON | RF-04 / RNF-06 | Plugin sonarjs `cognitive-complexity` (complementar, ver OQ-04 da spec) | 🟡 |
| D-17 | Hooks com lefthook: lint + complexidade nos staged, `tsc --noEmit`, dependency-cruiser, Vitest `--changed`, `gitleaks protect --staged` | RF-05; execução paralela, ≤ 60 s | husky + lint-staged (sequencial, mais dependências) | 🟡 |
| D-18 | IaC: Terraform ≥ 1.9 com provider `kreuzwerker/docker` em `infra/local/`, módulos por serviço em `infra/modules/` reaproveitáveis na nuvem | RF-01, `requirements.md` | docker compose puro (não atende "IaC com Terraform") | 🟢 |
| D-19 | Observabilidade: SDK OpenTelemetry Node (auto-instrumentação de HTTP e `pg`) → OTel Collector → Tempo (traces), Prometheus (métricas via exporter do Collector) e Loki (logs); logs JSON com pino com `trace_id`; Grafana com datasources e um dashboard provisionados | RF-17; pilha declarada em `requirements.md` | Exportar direto para cada backend (mais configuração na aplicação) | 🟢 |
| D-20 | CI GitHub Actions: workflow `pr.yml` com jobs `static` (lint, complexidade, tipos, arquitetura, drift de tipos), `unit`, `integration`, `contract`, `e2e` (sobe o ambiente com Terraform), `mutation` (incremental), `security` (Semgrep, OSV-Scanner, gitleaks); proteção da `main` exigindo todos + 1 aprovação, aplicada por script `gh api` versionado | RF-16; esclarecimento de 2026-11-22 | Aplicar proteção manualmente (não versionado) | 🟡 |
| D-21 | Semgrep roda via imagem Docker no Windows (não há binário nativo); OSV-Scanner e gitleaks como binários | Ferramentas escolhidas no esclarecimento; viabilidade no ambiente do usuário | — | 🟡 |
| D-23 | Decisões estruturais registradas como ADRs em `docs/adr/` (formato MADR) na primeira ação do coding, antes do código que as implementa. ADRs obrigatórios desta feature: ADR-0001 monólito modular e camadas (D-02, D-03); ADR-0002 PostgreSQL como banco único, com NoSQL avaliado e descartado (D-06, `investigation.md#2.5`); ADR-0003 fila no PostgreSQL com pg-boss em vez de Redis/BullMQ, com os critérios objetivos de migração para Redis (D-08, `investigation.md#2.1`); ADR-0004 contrato do canal schema-first (D-05); ADR-0005 testes de arquitetura e limite de complexidade (D-15, D-16); ADR-0006 IaC local com Terraform + Docker (D-18); ADR-0007 resposta determinística atrás de `AnswerGenerator` (D-11); ADR-0008 Node 22 via nvm (D-01) | Documentation First (`requirements.md`); pedido explícito do usuário para o banco e a fila | Decisões só no roadmap (não versionadas junto ao código) | 🟢 |
| D-22 | Módulos `identity` e `sources` separados conforme RF-02; o comando `seed` cria usuário, espaço `personal`, conta `provider=fake` ativa e uma fonte `authorized`, de forma idempotente | RF-09 | Um módulo único de identidade e fontes | 🟢 |

## 4. Premissas

Não há `[DÚVIDA]` aberta no `requirements.md`. Premissas técnicas adotadas neste plano, a confirmar durante o coding:

| Premissa | Origem (`requirements.md` seção) | Risco se errada |
|----------|----------------------------------|-----------------|
| O usuário vai instalar Node.js 22 via nvm (sem remover o Node 18 dos outros projetos), Docker Desktop e Terraform na máquina | 5 (RF-01), 6 (Plataforma) | Ambiente não sobe; a feature não pode ser validada localmente |
| pg-boss aceita enfileirar dentro da transação da aplicação | 5 (RF-10) | Volta para outbox explícito (D-08 alternativa), +1 tabela |
| O limiar de `low_confidence` 0,05 separa bem "achou" de "não achou" no corpus de teste | 5 (RF-12, RF-13) | E2E de "não encontrei" instável; ajustar o limiar |
| A esteira com E2E e mutação incremental cabe em 20 min | 6 (Desempenho) | Mover mutação para job noturno |

## 5. Delta arquitetural

| Componente | Arquivo de origem no legado | Tipo de mudança | Resumo |
|------------|------------------------------|-----------------|--------|
| platform-foundation | `_reversa_sdd/sdd/platform-foundation.md` | componente-novo | Repositório, IaC local, hooks, CI, testes de arquitetura e complexidade, observabilidade, harness |
| channel-contract | `_reversa_sdd/sdd/channel-contract.md` | contrato-novo | JSON Schemas, tipos, porta `KnowledgeChannel`, `AgentReply`, suíte de contrato |
| channels/fake | `_reversa_sdd/sdd/channel-contract.md#6.1` (RF-07) | componente-novo | Adaptador de teste com injeção HTTP |
| identity / sources | `_reversa_sdd/sdd/identity-and-sources.md` | componente-novo | Subconjunto: usuário, espaço pessoal, conta de canal, fonte, consulta de autorização, resolução do usuário |
| ingestion | `_reversa_sdd/sdd/ingestion.md` | componente-novo | Subconjunto: autorização, dedupe por `externalMessageId`, mensagem imutável, proveniência, enfileiramento transacional |
| knowledge | `_reversa_sdd/sdd/knowledge-indexing.md` | componente-novo | Subconjunto: chunk único com FTS, sem embeddings nem `KnowledgeItem` |
| retrieval | `_reversa_sdd/sdd/retrieval.md` | componente-novo | Subconjunto: FTS com filtro de espaço e `low_confidence` |
| agent | `_reversa_sdd/sdd/conversational-agent.md` | componente-novo | Subconjunto: intenção `ask`, resposta determinística, validação de citações |

## 6. Delta no modelo de dados

- Resumo das mudanças: criação inicial de `users`, `channel_accounts`, `knowledge_spaces`, `sources`, `participants`, `messages`, `message_provenance`, `message_chunks` e do schema do pg-boss. Subconjunto das entidades das specs, já com os nomes e chaves finais.
- Detalhe completo em: `_reversa_forward/001-walking-skeleton/data-delta.md`

## 7. Delta de contratos externos

| Contrato | Tipo | Arquivo de detalhe |
|----------|------|--------------------|
| Contrato do canal (`CanonicalMessage`, `AgentReply`, `KnowledgeChannel`) | esquema + porta em processo | `_reversa_forward/001-walking-skeleton/interfaces/channel-contract.md` |
| API HTTP do esqueleto (health, canal fake) | HTTP | `_reversa_forward/001-walking-skeleton/interfaces/http-api.md` |
| Job `knowledge.index` | fila | `_reversa_forward/001-walking-skeleton/interfaces/jobs.md` |

## 8. Plano de migração

n/a: projeto novo, sem dados nem usuários existentes. As migrações iniciais criam o esquema do zero e são reversíveis (`down`).

## 9. Riscos e mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| Máquina sem Docker e Terraform, e com Node 18 (verificado em 2026-11-22) | alto | alto | `onboarding.md` lista os pré-requisitos; o comando de setup verifica versões e falha com instrução clara |
| Ferramentas de segurança no Windows (Semgrep sem binário nativo) | médio | alto | Semgrep via Docker (D-21); a CI roda em Linux |
| Mutação lenta estourando 20 min na CI | médio | médio | Stryker incremental só no núcleo alterado; fallback para job noturno |
| Regras do dependency-cruiser frouxas ou erradas | médio | médio | Cada regra tem fixture de violação testada (D-15) |
| Exceções de complexidade virarem rotina | baixo | médio | Script exige registro com revisor; contagem de exceções no relatório da esteira |
| Flakiness no E2E por espera da indexação assíncrona | médio | médio | E2E aguarda o job concluir por polling com timeout de 30 s, não por sleep |
| Logs vazarem conteúdo de mensagens | alto | baixo | Serializers do pino redigem campos `text`; teste verifica ausência do texto nos logs |

## 10. Critério de pronto

- [ ] Todas as ações do `actions.md` marcadas `[X]`
- [ ] `cross-check.md` (se executado) sem CRITICAL nem HIGH
- [ ] `regression-watch.md` gerado
- [ ] Os 10 cenários Gherkin do `requirements.md#7` cobertos por testes automatizados verdes
- [ ] Esteira `pr.yml` verde em um pull request real e proteção da `main` aplicada
- [ ] Re-extração reversa executada e sem regressão vermelha (recomendado, não obrigatório)

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-22 | Versão inicial gerada por `/reversa-plan` | reversa |
| 2026-11-22 | D-01: Node 22 via nvm (pedido do usuário); D-08: porta `JobQueue` e racional detalhado | reversa |
| 2026-11-22 | D-23: ADRs obrigatórios, incluindo banco (NoSQL avaliado) e fila (critérios de migração para Redis) | reversa |
