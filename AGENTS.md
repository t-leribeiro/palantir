# AGENTS.md

Orientações para agentes de IA que trabalham neste repositório.

## Projeto: Palantír — Personal Knowledge Agent

Transforma conversas dispersas (grupos e contatos do WhatsApp, incluindo áudios transcritos) em uma base de conhecimento pesquisável, consultada pelo próprio WhatsApp. Visão completa e blueprint v0.1 em `ChatGPT-Ideacao.md`.

Princípios de produto:
- **WhatsApp-first, not WhatsApp-only**: o adaptador de captura/interface deve ser substituível sem alterar o núcleo de conhecimento.
- **Knowledge-first, not chatbot-first.**
- **Personal-first, community-ready.**
- **Evidence over hallucination**: toda afirmação factual da resposta cita a origem (autor, grupo, data).
- **Capture once, remember forever**, respeitando políticas de retenção e exclusão.

Fora do escopo da v0.1: memória coletiva entre usuários, knowledge graph sofisticado, agentes autônomos, múltiplas plataformas em produção, interface web completa, monetização e resumos proativos. Não implementar sem decisão explícita.

## Estado atual

S0 (feature `001`) e S1 (feature `002`, importação de conversas exportadas) entregues; adendos em `_reversa_sdd/addenda/`. Ainda sem WhatsApp ao vivo, transcrição nem busca semântica. **Plano e status das entregas: `docs/plano-de-fatias.md`** (atualize o status a cada fatia). Stack: TypeScript sobre Node 22, Fastify, PostgreSQL 16 (pgvector) e fila pg-boss no próprio banco. Decisões em `docs/adr/`.

Use `nvm use 22` antes de trabalhar: o `engine-strict` recusa outras versões e os hooks de commit falham sem ela. `npm run doctor` confere Node, Docker, Terraform, gitleaks e OSV-Scanner.

Comandos:
- Ambiente: `npm run setup` (Terraform; gera o `.env`), `npm run db:migrate`, `npm run seed`, `npm run dev:api`, `npm run dev:worker`, `npm run teardown`
- Importar uma conversa exportada do WhatsApp: `npm run import -- <arquivo.zip|.txt> --conversa "<nome>"`
- Exports reais do WhatsApp ficam só em `exports/` (fora do git: dados de terceiros, repositório público); `test/unit/whatsapp-export/real-exports.test.ts` roda sobre eles quando existem e só compara contagens
- Gates rápidos: `npm run typecheck`, `npm run lint` (complexidade ≤ 10), `npm run arch`, `npm run contracts:check`, `npm test`
- Com Docker: `npm run test:integration`, `npm run test:e2e`, `npm run test:mutation`, `npm run security`, `npm run eval`, `npm run test:load`
- DoR local completa: `npm run dor`
- Um teste isolado: `npx vitest run test/unit/agent/ask-question.test.ts -t "responde com citação"`

Arquitetura (regras verificadas pelo dependency-cruiser): `src/modules/<módulo>/{domain,application,infrastructure}` com API pública só em `index.ts`; o núcleo nunca importa `src/channels/**`; só `src/main` compõe portas e implementações; `src/platform` não importa módulos. Os tipos em `src/contracts/channel/generated.ts` vêm de `contracts/channel/*.schema.json` (`npm run contracts:generate`), nunca são editados à mão. A `main` é protegida: todo merge passa por PR com os 7 jobs de `.github/workflows/pr.yml` verdes.

## Requisitos de engenharia (fonte: `requirements.md`)

- **Documentation First** e **API First**: documentar e especificar o contrato da API antes de implementar.
- **Security First** e **Local First**.
- **TDD**: o teste vem antes da implementação.
- **SOLID**, **Clean Architecture**, **KISS**, **DRY**, **YAGNI**.
- **Pirâmide de testes**: unitário, integração, contrato, mutação e E2E.
- **Pre-commit hooks** rodando os testes antes de cada commit.
- **IaC com Terraform**.
- **Observabilidade**: Grafana, Prometheus, Tempo (traces) e Loki (logs).
- **Testes de arquitetura** e **complexidade ciclomática ≤ 10 por função** (requisitos não funcionais definidos pelo usuário, ADR-0005): bloqueiam commit e merge.

### Definition of Ready (`requirements.md`)
Uma entrega só está pronta quando tem:
- build passando;
- testes E2E passando;
- code review aprovado;
- análise de segurança do código sem achados críticos ou altos.

# Reversa

> Framework de Engenharia Reversa instalado neste projeto.

## Como usar

Use o fluxo adequado no chat:

- `reversa` — descobrir e documentar um sistema existente
- `reversa-new` — criar PRD e specs para um projeto novo
- `reversa-forward` — implementar ou evoluir código a partir das specs
- `reversa-migrate` — planejar a migração de um sistema legado
- `reversa-docs` — gerar o mini-site visual da documentação
- `impeccable` — design de front-end: criticar, auditar e polir interfaces (Impeccable, Apache 2.0)
- `reversa-agents-help` — consultar o catálogo completo de agentes

## Comportamento ao ativar

Quando o usuário digitar `reversa` sozinho em uma mensagem:

1. Ative o skill `reversa` disponível em `.agents/skills/reversa/SKILL.md`
2. Leia o SKILL.md na íntegra e siga exatamente as instruções do Reversa

## Regra não-negociável

Por padrão, nunca apague, modifique ou sobrescreva arquivos pré-existentes do projeto legado:
o Reversa escreve apenas em `.reversa/`, `_reversa_sdd/`, `_reversa_docs/`, `_reversa_forward/`, `_reversa_bugs/` e `_reversa_refactor/`.
A única exceção é a política configurável abaixo, controlada exclusivamente pelo usuário.

Antes de criar, modificar ou apagar qualquer arquivo fora das pastas próprias do Reversa, leia `.reversa/reversa-config.json` e obedeça ao resultado:

- Arquivo ausente, JSON inválido ou campo com tipo errado: trate como `allowLegacyEdits: false` (falha segura, nenhuma escrita fora das pastas do Reversa).
- `allowLegacyEdits: false`: recuse a escrita, informando o caminho recusado, o estado atual da config e o que o usuário deve editar para liberar.
- `allowLegacyEdits: true` com `allowedPaths` não vazio: escreva apenas em caminhos que casem com algum glob da lista (globs relativos à raiz do projeto, com `/`, suportando `*` e `**`).
- `allowLegacyEdits: true` com `allowedPaths` vazio ou ausente: projeto liberado; avise uma vez por sessão que a liberação é irrestrita.

Nunca crie nem edite `.reversa/reversa-config.json` por iniciativa própria: pedido na conversa não é liberação implícita, alterações nesse arquivo são ato exclusivo do usuário.
