# Palantír

Personal Knowledge Agent: transforma conversas dispersas (grupos do WhatsApp, incluindo áudios) em uma memória pesquisável, consultada pelo próprio canal, com a fonte de cada resposta. WhatsApp-first, not WhatsApp-only.

Estado: **S3 implementada** (feature `004`): um grupo de teste autorizado, com consentimento declarado, é capturado ao vivo e aparece nas respostas em segundos, sem duplicar o histórico importado (S1). Por enquanto o próprio número do agente (S2) captura. Áudios e busca semântica vêm nas próximas fatias.

- Produto: [`_reversa_sdd/prd.md`](_reversa_sdd/prd.md) e specs em [`_reversa_sdd/sdd/`](_reversa_sdd/sdd/)
- Plano e status das entregas: [`docs/plano-de-fatias.md`](docs/plano-de-fatias.md)
- Decisões de arquitetura: [`docs/adr/`](docs/adr/README.md)
- Feature atual: [`_reversa_forward/004-captura-ao-vivo-grupo-teste/`](_reversa_forward/004-captura-ao-vivo-grupo-teste/)

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

Importar uma conversa exportada do WhatsApp (S1): `npm run import -- <arquivo.zip|.txt> --conversa "<nome>"` (roteiro em [`onboarding.md` da 002](_reversa_forward/002-perguntar-historico-importado/onboarding.md)).

Perguntar pelo WhatsApp (S2): cadastre seu número com `npm run whatsapp:link -- "+55 11 9XXXX-XXXX"`, ligue `PALANTIR_WHATSAPP_ENABLED=true` no `.env` e rode `npm run dev:whatsapp`; leia o QR Code com o celular do chip do agente (roteiro em [`onboarding.md` da 003](_reversa_forward/003-perguntar-pelo-whatsapp/onboarding.md); riscos no [ADR-0009](docs/adr/0009-adaptador-whatsapp-nao-oficial.md)).

Capturar um grupo de teste ao vivo (S3): ligue `PALANTIR_WHATSAPP_CAPTURE=agent` no `.env`, adicione o chip ao grupo, rode `npm run dev:whatsapp` e `npm run dev:worker`, e autorize com `npm run whatsapp:grupos -- autorizar <número> --consentimento "<como os participantes foram avisados>" [--conversa "<nome da importação>"]` (o chip precisa ser membro do grupo; nome do grupo diferente do `--conversa` exige `--confirmar`) (roteiro em [`onboarding.md` da 004](_reversa_forward/004-captura-ao-vivo-grupo-teste/onboarding.md)).

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
| `npm run import -- <arquivo> --conversa "<nome>"` | Importa uma conversa exportada do WhatsApp (só texto na S1); reimportar não duplica |
| `npm run whatsapp:link -- "<número>"` | Cadastra o número pessoal na conta WhatsApp do dono (sem código nesta fatia) |
| `npm run dev:whatsapp` | Processo do número do agente; desligado por padrão (`PALANTIR_WHATSAPP_ENABLED`); captura de grupos com `PALANTIR_WHATSAPP_CAPTURE` (`off`, `agent`, `dedicated`) |
| `npm run whatsapp:grupos -- [listar \| autorizar <grupo> --consentimento "<texto>" [--conversa "<nome>"] \| revogar <grupo>]` | Lista, autoriza (com consentimento) e revoga a captura de grupos; lê só do banco |
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
