# Adendo: Walking skeleton da platform-foundation

> Feature: `001-walking-skeleton`
> Data: `2026-11-23`
> Cenário: `greenfield`

## Vigência

Vigente desde 2026-11-23.

## Resumo da entrega

Primeira entrega do Palantír: fundação de engenharia e caminho ponta a ponta com um canal de teste. Uma mensagem entra pelo adaptador fake, é gravada uma única vez, fica pesquisável e é recuperada por uma pergunta ao agente, que responde com citação da mensagem de origem ou com "Não encontrei evidências suficientes.". Tudo roda localmente com um comando, sob os gates do projeto (TDD, pirâmide de testes, testes de arquitetura, complexidade ciclomática ≤ 10, segurança).

56 de 56 ações concluídas (`_reversa_forward/001-walking-skeleton/progress.jsonl`). Integrada à `main` pelo PR #1 de `t-leribeiro/palantir`, com os 7 jobs da esteira verdes.

## Impacto por artefato da extração

Todas as specs continuam 🟡 PLANEJADO: o código novo ainda não passou por uma extração `/reversa`. As linhas abaixo dizem o que delas já está implementado e onde a implementação diverge do texto.

| Artefato | Seção | Tipo de impacto | Delta |
|----------|-------|-----------------|-------|
| `_reversa_sdd/prd.md` | 4. Escopo (in) | componente-novo | Implementados nesta feature: contrato canônico e interface de canal, ingestão idempotente, busca textual, agente com fontes e "não encontrei", segurança e engenharia de `requirements.md`. Captura via Baileys, importação de ZIP, transcrição, busca semântica, guardar com tema e resumos seguem pendentes. |
| `_reversa_sdd/prd.md` | 6. Restrições | componente-novo | Object storage local é SeaweedFS, não MinIO (a MinIO não publica mais imagens; ADR-0006). Stack confirmada: TypeScript sobre Node 22 via nvm, Fastify, pg-boss, PostgreSQL 16 com pgvector. |
| `_reversa_sdd/sdd/platform-foundation.md` | 6. Requisitos Funcionais | componente-novo | RF-01 a RF-12 implementados: ambiente local em Terraform, monólito modular, testes de arquitetura, hooks, pirâmide de testes, E2E, DoR como gate, observabilidade, API first, harness de avaliação, segredos por env. RF-08 usa 0 aprovação por ora (único colaborador). |
| `_reversa_sdd/sdd/platform-foundation.md` | 7. Requisitos Não-Funcionais | componente-novo | RNF-05 (8 regras de arquitetura) e RNF-06 (complexidade ≤ 10 com exceções registradas) ativos no pre-commit e na esteira. Medido: cobertura de linhas do núcleo 100%, mutação 91,96%. |
| `_reversa_sdd/sdd/channel-contract.md` | 6. Requisitos Funcionais | delta-de-contrato-externo | Contrato 1.0.0 publicado em `contracts/` (JSON Schema + OpenAPI), com `provider` livre e importação como `captureMethod`. A porta separa `onMessage` (fontes) de `onAgentMessage` (perguntas). RF-01 a RF-08 implementados; `fetchMedia` ainda não existe. |
| `_reversa_sdd/sdd/identity-and-sources.md` | 6. Requisitos Funcionais | componente-novo | Implementados RF-01 (espaço pessoal, via seed), RF-02, RF-04, RF-06 e RF-09. Vinculação com código de verificação, autorizar/revogar/excluir pelo agente, retenção e auditoria (RF-03, RF-05, RF-07, RF-08, RF-10) seguem pendentes; a exclusão em cascata já é garantida pelo banco. |
| `_reversa_sdd/sdd/ingestion.md` | 6. Requisitos Funcionais | componente-novo | RF-01, RF-02, RF-05, RF-06 e RF-09 implementados. **Divergência:** o outbox do RF-07 foi substituído por enfileiramento na mesma transação com pg-boss (ADR-0003). Reconciliação captura × importação (RF-03, RF-04) pendente, junto com o importador. |
| `_reversa_sdd/sdd/knowledge-indexing.md` | 6. Requisitos Funcionais | componente-novo | Um chunk por mensagem com índice textual em português (RF-01, RF-02 parcial, RF-09). Embeddings, guardar com tema e reconstrução do índice pendentes. |
| `_reversa_sdd/sdd/retrieval.md` | 6. Requisitos Funcionais | regra-nova | RF-01, RF-05, RF-06 e RF-08 implementados com busca só textual. **Divergência:** o score é a fração de termos da pergunta presentes na mensagem (palavras como "quem" e "falou" não contam), com limiar de baixa confiança 0,5, no lugar da fusão de três estratégias (RF-02, RF-03), que fica para a feature de busca híbrida. |
| `_reversa_sdd/sdd/conversational-agent.md` | 6. Requisitos Funcionais | componente-novo | RF-01, RF-03, RF-04, RF-05 e RF-10 implementados. A resposta é determinística, sem LLM (ADR-0007); classificação de intenção, mostrar original, guardar, resumos e sessão (RF-02, RF-06 a RF-09, RF-11) pendentes. |
| `_reversa_sdd/sdd/whatsapp-baileys-adapter.md`, `whatsapp-export-importer.md`, `media-transcription.md` | todas | sem impacto | Não implementados nesta feature. |

Impactos registrados: 10 linhas (7 `componente-novo`, 1 `delta-de-contrato-externo`, 1 `regra-nova`, 1 sem impacto).

## Regras sob vigilância

W001 a W018, em `_reversa_forward/001-walking-skeleton/regression-watch.md` (seção Observações, sem peso de regressão até uma extração confirmar as regras como 🟢).

## Fontes

- `_reversa_forward/001-walking-skeleton/legacy-impact.md`
- `_reversa_forward/001-walking-skeleton/regression-watch.md`
- `_reversa_forward/001-walking-skeleton/requirements.md`
- `_reversa_forward/001-walking-skeleton/actions.md`
- `_reversa_forward/001-walking-skeleton/progress.jsonl`
- `docs/adr/`
