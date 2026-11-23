# Palantír

Personal Knowledge Agent: transforma conversas dispersas (grupos do WhatsApp, incluindo áudios) em uma memória pesquisável, consultada pelo próprio canal, com a fonte de cada resposta. WhatsApp-first, not WhatsApp-only.

Estado: **walking skeleton** (feature `001`). O caminho completo funciona com um canal de teste: mensagem → ingestão → indexação → pergunta → resposta com citação ou "Não encontrei evidências suficientes.". WhatsApp real, transcrição e busca semântica são as próximas features.

- Produto: [`_reversa_sdd/prd.md`](_reversa_sdd/prd.md) e specs em [`_reversa_sdd/sdd/`](_reversa_sdd/sdd/)
- Decisões de arquitetura: [`docs/adr/`](docs/adr/README.md)
- Feature atual: [`_reversa_forward/001-walking-skeleton/`](_reversa_forward/001-walking-skeleton/)

## Pré-requisitos

| Ferramenta | Versão | Observação |
|------------|--------|------------|
| Node.js | 22 (`.nvmrc`) | Via nvm: `nvm install 22` e `nvm use 22`. O `engine-strict` recusa outras versões |
| Docker Desktop | atual | Ambiente local, Testcontainers e Semgrep |
| Terraform | ≥ 1.9 | No PATH ou em `C:\terraform` |
| gitleaks | 8.x | `winget install Gitleaks.Gitleaks` |
| OSV-Scanner | 2.x | `winget install Google.OSVScanner` |

`npm run doctor` confere tudo.

## Primeiros passos

```bash
nvm use 22
npm ci                 # instala dependências e os hooks de pre-commit (lefthook)
npm run setup          # Terraform: PostgreSQL, SeaweedFS (S3), OTel Collector, Prometheus, Tempo, Loki, Grafana; gera o .env
npm run db:migrate
npm run seed           # operador, espaço pessoal, conta fake e "Grupo de teste" autorizado
npm run dev:api        # http://localhost:8080
npm run dev:worker     # em outro terminal
```

Testar o caminho completo e observar no Grafana (http://localhost:3000): veja [`onboarding.md`](_reversa_forward/001-walking-skeleton/onboarding.md). `npm run teardown` destrói o ambiente.

## Comandos

| Comando | O que faz |
|---------|-----------|
| `npm run typecheck` | TypeScript `strict` |
| `npm run lint` | ESLint, incluindo complexidade ciclomática ≤ 10 por função |
| `npm run complexity:check` / `complexity:report` | Exceções registradas em `quality/complexity-exceptions.json` / média e máximo por módulo |
| `npm run arch` | Testes de arquitetura (dependency-cruiser) |
| `npm run contracts:generate` / `contracts:check` | Tipos gerados a partir de `contracts/channel/*.schema.json` / verificação de drift |
| `npm test` | Unitários, arquitetura e contrato (sem Docker) |
| `npm run test:integration` | PostgreSQL real via Testcontainers |
| `npm run test:e2e` | Walking skeleton ponta a ponta (API e worker reais) |
| `npm run test:mutation` | StrykerJS, limiar 60% |
| `npm run test:load` | Carga de ingestão (critério de migração do ADR-0003) |
| `npm run eval` | Conjunto de avaliação (`eval/cases.json`): acertos, citações, "não encontrei" |
| `npm run security` | Semgrep, OSV-Scanner e gitleaks; falha em achado crítico ou alto |
| `npm run dor` | Todos os itens automáticos da DoR, localmente |

Um teste isolado: `npx vitest run test/unit/agent/ask-question.test.ts -t "responde com citação"`.

## Definição de pronto (DoR)

Build verde, testes E2E verdes, code review aprovado e segurança sem achados críticos ou altos, além de testes de arquitetura sem violações e complexidade dentro do limite. O pre-commit (`lefthook.yml`) roda os gates rápidos; a esteira (`.github/workflows/pr.yml`) roda tudo, e `scripts/branch-protection.sh` torna os jobs obrigatórios na `main`.

## Estrutura

```
contracts/          JSON Schemas do canal e OpenAPI (fonte da verdade, API first)
src/modules/        núcleo: identity, sources, ingestion, knowledge, retrieval, agent (domínio/aplicação/infra)
src/channels/       adaptadores de canal (o núcleo nunca os importa)
src/platform/       config, banco, fila, HTTP, logs e telemetria
src/main/           composição e entrypoints (api, worker, migrate, seed)
infra/              Terraform do ambiente local
migrations/         SQL versionado
test/               unit, architecture, quality, contract, integration, e2e, load
```
