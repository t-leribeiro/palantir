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

Ainda não existe código: só ideação e requisitos. Comandos de build, lint e teste (incluindo como rodar um teste isolado) entram aqui quando a stack for definida.

## Requisitos de engenharia (fonte: `requirements.md`)

- **Documentation First** e **API First**: documentar e especificar o contrato da API antes de implementar.
- **Security First** e **Local First**.
- **TDD**: o teste vem antes da implementação.
- **SOLID**, **Clean Architecture**, **KISS**, **DRY**, **YAGNI**.
- **Pirâmide de testes**: unitário, integração, contrato, mutação e E2E.
- **Pre-commit hooks** rodando os testes antes de cada commit.
- **IaC com Terraform**.
- **Observabilidade**: Grafana, Prometheus, Tempo (traces) e Loki (logs).

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
