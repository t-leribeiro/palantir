# Legacy impact: Walking skeleton da platform-foundation

> Identificador: `001-walking-skeleton`
> Data: `2026-11-22`
> Feature greenfield, sem legado pré-existente. Âncora: `_reversa_sdd/prd.md` + specs SDD em `_reversa_sdd/sdd/`.
> Política de edição no momento da execução: `allowLegacyEdits: true`, `allowedPaths: []` (projeto inteiro liberado).
> Execução: rodadas 1 e 2, 54 de 56 ações (T047 e T048 aguardam execução no GitHub).

## Arquivos afetados

Nenhum arquivo pré-existente do projeto foi modificado. Todos os arquivos abaixo são novos.

| Arquivo afetado | Componente (spec) | Tipo | Severidade | Justificativa |
|-----------------|-------------------|------|------------|---------------|
| `docs/adr/0001`–`0008`, `docs/adr/README.md` | platform-foundation | componente-novo | LOW | Documentation First; decisões estruturais registradas antes do código |
| `package.json`, `package-lock.json`, `.nvmrc`, `.npmrc`, `tsconfig*.json`, `.gitignore`, `.editorconfig` | platform-foundation | componente-novo | LOW | Estrutura do pacote TypeScript sobre Node 22 |
| `eslint.config.js`, `scripts/complexity.mjs`, `scripts/complexity.d.mts`, `quality/complexity-exceptions.json` | platform-foundation (RNF-06) | componente-novo | MEDIUM | Gate de complexidade ciclomática ≤ 10 com exceções registradas |
| `.dependency-cruiser.cjs` | platform-foundation (RNF-05) | componente-novo | MEDIUM | 8 regras de arquitetura (5 obrigatórias + 3 de reforço) |
| `vitest.config.ts`, `vitest.mutation.config.ts`, `stryker.config.mjs` | platform-foundation (RF-19) | componente-novo | LOW | Pirâmide de testes e mutação |
| `lefthook.yml`, `scripts/hooks/gitleaks-staged.mjs` | platform-foundation (RF-05) | componente-novo | MEDIUM | Pre-commit; hooks ainda não instalados |
| `scripts/doctor.mjs`, `scripts/dor.mjs`, `scripts/security.mjs` | platform-foundation (RF-08, RF-12) | componente-novo | MEDIUM | Pré-requisitos, DoR local e segurança |
| `contracts/channel/*.schema.json`, `contracts/openapi.yaml`, `scripts/contracts.mjs` | channel-contract | delta-de-contrato-externo | HIGH | Contrato 1.0.0 do canal e API HTTP, fonte da verdade (ADR-0004) |
| `src/contracts/channel/*` | channel-contract | componente-novo | HIGH | Tipos gerados e porta `KnowledgeChannel` |
| `src/shared/*` | platform-foundation | componente-novo | LOW | Kernel (ids, relógio, Result, erros) |
| `src/platform/config.ts`, `src/platform/contracts/validator.ts`, `src/platform/http/*`, `src/platform/logging/logger.ts`, `.env.example` | platform-foundation, channel-contract | componente-novo | MEDIUM | Config por env, validação Ajv, servidor HTTP, logs sem conteúdo |
| `src/modules/identity/*` | identity-and-sources | componente-novo | MEDIUM | Resolução do usuário pela conta de canal ativa |
| `src/modules/sources/*` | identity-and-sources | componente-novo | MEDIUM | Opt-in por conversa (decisão de ingestão) |
| `src/modules/ingestion/*` | ingestion | componente-novo | HIGH | Autorização, deduplicação, mensagem imutável, enfileiramento atômico |
| `src/modules/knowledge/*` | knowledge-indexing | componente-novo | MEDIUM | Um chunk por mensagem, idempotente |
| `src/modules/retrieval/*` | retrieval | componente-novo | HIGH | Espaço obrigatório, baixa confiança, melhor trecho por mensagem |
| `src/modules/agent/*` | conversational-agent | componente-novo | HIGH | Resposta determinística com citações validadas |
| `src/channels/fake/*` | channel-contract (RF-07) | componente-novo | MEDIUM | Adaptador de teste com rotas HTTP |
| `test/**` | platform-foundation | componente-novo | LOW | Testes de arquitetura, complexidade, unitários, contrato, HTTP, integração, E2E e carga |
| `infra/**`, `scripts/infra.mjs` | platform-foundation (RF-01, RF-02) | componente-novo | MEDIUM | Ambiente local em Terraform; SeaweedFS no lugar do MinIO |
| `migrations/*.sql`, `src/platform/db/*` | ingestion, identity-and-sources, knowledge-indexing | delta-de-dados | HIGH | 8 tabelas, imutabilidade por trigger, cascata de exclusão |
| `src/platform/queue/*` | ingestion | componente-novo | HIGH | pg-boss com envio na mesma transação (ADR-0003) |
| `src/modules/*/infrastructure/*` | todos os módulos do núcleo | componente-novo | HIGH | Repositórios PostgreSQL e busca textual com score por fração de termos |
| `src/main/*` | platform-foundation | componente-novo | MEDIUM | Composição, entrypoints, seed e migração |
| `src/platform/telemetry/*` | platform-foundation (RF-17) | componente-novo | MEDIUM | Traces, métricas e logs via OTLP |
| `.github/workflows/pr.yml`, `scripts/branch-protection.sh` | platform-foundation (RF-16) | componente-novo | MEDIUM | Esteira e proteção da main (ainda não executadas no GitHub) |
| `eval/cases.json`, `scripts/eval.ts`, `README.md`, `.gitleaks.toml` | platform-foundation | componente-novo | LOW | Avaliação, documentação e allowlist revisada |

## Diff conceitual por componente

- **channel-contract:** nasce o contrato 1.0.0. `provider` é texto livre e a importação é `captureMethod`, como decidido na conversa sobre "WhatsApp-first, not only". Mudança em relação ao Blueprint da ideação: o enum fechado de provedores foi abandonado.
- **ingestion:** o outbox da spec foi substituído por enfileiramento na mesma transação (ADR-0003). A porta `UnitOfWork` garante isso; a implementação real (pg-boss) ainda está pendente (T038).
- **retrieval / agent:** baixa confiança ou ausência de resultados geram "Não encontrei evidências suficientes."; o validador de citações faz uma regeneração antes de desistir.
- **platform-foundation:** gates locais funcionando (tipos, lint, complexidade, arquitetura, drift de contrato, unitários, mutação). Ambiente com Terraform, integração, E2E, CI e observabilidade estão pendentes de Docker e Terraform.

## Preservadas

Feature greenfield: não há regras 🟢 extraídas de código existente para preservar.

## Modificadas

Feature greenfield: nenhuma regra 🟢 foi alterada ou removida.
