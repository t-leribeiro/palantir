# ADR-0001: Monólito modular com camadas Clean Architecture

- Status: aceito
- Data: 2026-11-22
- Decisores: Leandro (produto), reversa-plan
- Origem: `_reversa_forward/001-walking-skeleton/roadmap.md` (D-02, D-03)

## Contexto

A v0.1 do Palantír é um experimento pessoal, local-first, com orçamento baixo. Os requisitos de engenharia (`requirements.md`) pedem SOLID, Clean Architecture, KISS e YAGNI. O PRD descarta Kubernetes, microsserviços e Kafka nesta fase.

## Decisão

Um único pacote TypeScript organizado assim:

- `src/modules/<módulo>/{domain,application,infrastructure}` para `identity`, `sources`, `ingestion`, `knowledge`, `retrieval` e `agent`. Cada módulo expõe sua API pública em `src/modules/<módulo>/index.ts`.
- `src/channels/<adaptador>` para adaptadores de canal (o núcleo nunca os importa).
- `src/contracts` para contratos compartilhados (tipos gerados do JSON Schema e a porta `KnowledgeChannel`).
- `src/platform` para infraestrutura transversal (config, banco, fila, http, telemetria, logs).
- `src/shared` para o kernel (ids, relógio, `Result`, erros).
- `src/main` como raiz de composição, o único lugar que liga portas a implementações.

Dois processos saem do mesmo build: `api` (HTTP) e `worker` (jobs), escolhidos por `PALANTIR_ROLE`.

## Consequências

- Positivas: um repositório, um build, fronteiras explícitas e verificadas (ADR-0005); extrair um módulo para serviço próprio no futuro é viável porque cada um só é acessado pela API pública.
- Negativas: escala horizontal por módulo não é possível sem extração; as fronteiras dependem dos testes de arquitetura.

## Alternativas consideradas

- Microsserviços: custo operacional incompatível com a v0.1.
- Monorepo com workspaces: ferramental extra sem ganho com um único time e um único deploy.
