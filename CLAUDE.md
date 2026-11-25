# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

S0 (feature `001`) e S1 (feature `002`, importação de conversas exportadas) entregues; S2 (feature `003`, perguntar pelo WhatsApp ao número do agente) entregue; S3 (feature `004`, captura ao vivo de um grupo de teste autorizado, por enquanto pelo número do agente) entregue; S4 (feature `005`, perguntar sobre o que foi dito em áudios importados ou ao vivo, com transcrição local) entregue; S5 (feature `006`, listar, acompanhar, parar e apagar grupos conversando com o agente, com verificação da conta por código e filtro por grupo na pergunta) entregue; adendos em `_reversa_sdd/addenda/`. Ainda sem busca semântica. **Plano e status das entregas: `docs/plano-de-fatias.md`** (atualize o status a cada fatia). Stack: TypeScript sobre Node 22, Fastify, PostgreSQL 16 (pgvector) e fila pg-boss no próprio banco. Decisões em `docs/adr/`.

Use `nvm use 22` antes de trabalhar: o `engine-strict` recusa outras versões e os hooks de commit falham sem ela. `npm run doctor` confere Node, Docker, Terraform, gitleaks e OSV-Scanner.

Comandos:
- Ambiente: `npm run setup` (Terraform; gera o `.env`), `npm run db:migrate`, `npm run seed`, `npm run dev:api`, `npm run dev:worker`, `npm run teardown`
- Importar uma conversa exportada do WhatsApp: `npm run import -- <arquivo.zip|.txt> --conversa "<nome>"`
- WhatsApp do agente (ADR-0009): `npm run whatsapp:link -- "<número>"` cadastra o número pessoal; `npm run dev:whatsapp` sobe o canal (só com `PALANTIR_WHATSAPP_ENABLED=true`; QR Code no terminal na primeira vez; health em `:8081/health`). A biblioteca não oficial só pode ser importada em `src/channels/whatsapp/provider/baileys-provider.ts` (regra `whatsapp-lib-isolated`); testes usam `simulated-provider.ts`. A sessão fica em `~/.palantir/whatsapp/`, criptografada com `PALANTIR_WA_SESSION_KEY`, que o `npm run setup` gera e preserva
- Captura de grupos (S3): `PALANTIR_WHATSAPP_CAPTURE` = `off` (padrão), `agent` (o número do agente captura) ou `dedicated` (segundo número, `capture-session.enc`); `npm run whatsapp:grupos` lista, autoriza (`--consentimento` obrigatório, `--conversa` liga à importação) e revoga, lendo só do banco. Nenhum número escreve em grupos; importação e captura do mesmo grupo se reconciliam (mesmo texto em até 60 s)
- Mídia e transcrição (S4): só áudio é guardado (`PALANTIR_MEDIA_STORE_KINDS`), cifrado (AES-256-GCM, `PALANTIR_MEDIA_KEY` gerada pelo setup) no SeaweedFS com chave pelo conteúdo; o worker transcreve pela porta `Transcriber` (`PALANTIR_TRANSCRIBER=openai-compatible` no Speaches local em `:8090`, ou `fake` nos testes; motor remoto só com `PALANTIR_TRANSCRIBER_ALLOW_REMOTE=true`). `@aws-sdk/*` só em `src/modules/media/infrastructure/object-store/` (regra `object-store-isolated`) e adaptadores do motor só em `transcribers/` (regra `transcriber-engine-isolated`). `npm run transcricao:modelos -- <id>` baixa modelos, `npm run eval:transcricao -- <preparar|fleurs|medir>` mede (tudo em `exports/medicao/`, só números na saída), `npm run media:conferir` confere a cifra. `PALANTIR_TRANSCRIPTION=off` pausa sem perder áudio. Testes usam `test/support/audio.ts` (Ogg sintético com roteiro) e nunca áudio real
- Gestão de fontes (S5, ADR-0011): `whatsapp:link` deixa a conta `pending` e mostra o código de 6 dígitos (só no terminal; no banco, o hash) que o dono manda ao agente; os comandos `grupos`, `mais`, `acompanhar`, `confirmo`, `parar`, `apagar` e `confirmo apagar <nome>` ficam no núcleo do agente (`agent/domain/command.ts`, palavras fixas), com estado curto em `agent_conversation_state`. Apagar marca a fonte `deleting` e publica `sources.delete`; o worker purga a mídia pelo prefixo e apaga em cascata; o aviso vai pela fila `agent.notify.<canal>`. Auditoria sem conteúdo em `audit_events` (`npm run auditoria`); `whatsapp:grupos -- apagar <grupo> --nome "<nome>"`. Testes que precisam de conta ativa usam `test/support/link.ts` (`linkVerified`)
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

- `/reversa` — descobrir e documentar um sistema existente
- `/reversa-new` — criar PRD e specs para um projeto novo
- `/reversa-forward` — implementar ou evoluir código a partir das specs
- `/reversa-migrate` — planejar a migração de um sistema legado
- `/reversa-docs` — gerar o mini-site visual da documentação
- `/impeccable` — design de front-end: criticar, auditar e polir interfaces (Impeccable, Apache 2.0)
- `/reversa-agents-help` — consultar o catálogo completo de agentes

## Comportamento ao ativar

Quando o usuário digitar `/reversa` ou a palavra `reversa` sozinha em uma mensagem:

1. Ative o skill `reversa` disponível em `.claude/skills/reversa/SKILL.md`
2. Se não encontrar em `.claude/skills/`, tente `.agents/skills/reversa/SKILL.md`
3. Leia o SKILL.md na íntegra e siga exatamente as instruções do Reversa

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
