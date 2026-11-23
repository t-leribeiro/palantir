# Investigation: Walking skeleton da platform-foundation

> Identificador: `001-walking-skeleton`
> Data: `2026-11-22`
> Fontes internas: `requirements.md` (raiz), `_reversa_sdd/prd.md`, `_reversa_sdd/sdd/*.md`, `ChatGPT-Ideacao.md`

## 1. Ambiente verificado

Levantamento feito na máquina do usuário em 2026-11-22:

| Ferramenta | Encontrado | Necessário | Ação |
|------------|-----------|------------|------|
| Node.js | 18.20.8 (usado por outros projetos) | 22 LTS via nvm | Instalar o 22 pelo nvm-windows, sem remover o 18 |
| npm | 10.8.2 | ≥ 10 | ok |
| Docker | ausente | Docker Desktop com WSL2 | Instalar |
| Terraform | ausente | ≥ 1.9 | Instalar |
| Git | 2.55 | ≥ 2.40 | ok |
| gitleaks, OSV-Scanner | não verificado | binários no PATH | Instalar (ver `onboarding.md`) |
| Semgrep | não verificado | via imagem Docker | Sem instalação extra além do Docker |

## 2. Alternativas avaliadas

### 2.1 Fila de jobs

| Opção | Prós | Contras | Veredito |
|-------|------|---------|----------|
| pg-boss (PostgreSQL) | Zero infraestrutura extra; enfileirar na mesma transação da gravação | Vazão menor que Redis (suficiente para a v0.1) | Escolhida (D-08) |
| BullMQ + Redis | Maduro, alto desempenho; sugerido na ideação | +1 serviço; exige outbox para atomicidade | Reavaliar se a vazão de ingestão (≥ 200 msg/s) não for atingida |
| Outbox + polling próprio | Controle total | Código a manter | Descartada |

Racional da escolha:

1. **Atomicidade sem outbox.** A regra RF-10 exige que gravar a mensagem e disparar a indexação aconteçam juntos. Com Redis são dois sistemas: se o processo cair entre o commit no PostgreSQL e o `add` no Redis, a mensagem fica sem indexação (ou, na ordem inversa, o job aponta para uma mensagem que não existe). A correção padrão é o outbox transacional: uma tabela extra, um processo relay que lê e publica, e tratamento de duplicatas. Com a fila no PostgreSQL, o job entra no mesmo `COMMIT`.
2. **Menos infraestrutura.** Local First, KISS/YAGNI e a restrição de custo baixo: um serviço a menos para subir no Terraform, monitorar, fazer backup e proteger.
3. **Volume da v0.1.** Uso pessoal, com captura de alguns grupos e importações pontuais. A meta de ingestão (≥ 200 msg/s, `_reversa_sdd/sdd/ingestion.md#3`) é verificada por teste de carga na própria feature; se não for atingida, o critério de troca abaixo é acionado.
4. **Troca contida.** A porta `JobQueue` isola a biblioteca; trocar por BullMQ altera só `src/platform/queue` e adiciona o outbox.

Quando o Redis passa a valer a pena (critério de reavaliação):

- vazão de jobs ou latência de enfileiramento abaixo da meta no teste de carga;
- necessidade de rate limit por destinatário no envio do WhatsApp (1 msg/s, `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#RF-10`), que o BullMQ oferece pronto;
- necessidade de cache ou de estado de sessão compartilhado (ex.: sessões do agente), quando o Redis já teria outro uso.

### 2.2 Testes de arquitetura

| Opção | Ciclos | Regras por camada | Saída para CI | Veredito |
|-------|--------|-------------------|---------------|----------|
| dependency-cruiser | sim | sim (regex de caminho) | sim | Escolhida (D-15) |
| ts-arch | parcial | sim | sim | Descartada (menos maduro) |
| ESLint `import/no-restricted-paths` + `import/no-cycle` | sim (lento) | sim | sim | Descartada (`no-cycle` pesado em projetos médios) |

### 2.3 Complexidade ciclomática

| Opção | Observação | Veredito |
|-------|-----------|----------|
| ESLint `complexity` (core) | Regra nativa, mede ciclomática por função, roda no hook | Escolhida (D-16) |
| `eslint-plugin-sonarjs` `cognitive-complexity` | Mede complexidade cognitiva, complementar | Opcional, depende da OQ-04 de `platform-foundation` |
| Ferramenta externa (ex.: plataforma de qualidade) | Exige servidor/conta | Descartada pela restrição de custo baixo/local |

### 2.4 IaC do ambiente local

| Opção | Atende "IaC com Terraform" | Observação | Veredito |
|-------|----------------------------|-----------|----------|
| Terraform + provider Docker | sim | Módulos reaproveitáveis para nuvem | Escolhida (D-18) |
| docker compose | não | Mais simples | Descartada |
| Terraform chamando docker compose | parcial | Estado do Terraform não reflete containers | Descartada |

### 2.5 Banco de dados: relacional ou NoSQL

| Opção | Busca textual pt-BR, aproximada e vetorial | Filtro de isolamento dentro da busca | Integridade (unicidade, cascata, transação) | Local First | Veredito |
|-------|---------------------------------------------|--------------------------------------|---------------------------------------------|-------------|----------|
| PostgreSQL (FTS + pg_trgm + pgvector) | Sim, as três no mesmo motor e na mesma query | Sim, `WHERE space_id = $1` na própria query | Forte: chaves únicas parciais, FKs com cascata, transações | Sim, container local | Escolhida (D-06) |
| DynamoDB (serverless) | Não nativa; exige OpenSearch ou similar sincronizado à parte | Só no índice de busca externo | Transações limitadas, sem FKs nem cascata | Não: DynamoDB Local é emulador e não tem busca; amarra à AWS | Descartada |
| MongoDB | Busca textual e vetorial completas ligadas sobretudo ao Atlas (nuvem); na versão self-managed são recentes ou limitadas | Sim, com filtro no pipeline | Transações multi-documento existem; sem FKs nem cascata | Parcial | Descartada |

Racional:

1. **O coração do produto é busca, não armazenamento.** A busca híbrida (palavra exata, aproximada e semântica) com filtros por espaço, fonte, autor e período é a funcionalidade central. O PostgreSQL faz tudo isso numa única query. Com DynamoDB, a busca iria para um segundo sistema (OpenSearch), com sincronização entre os dois e o mesmo problema de consistência discutido na fila (2.1).
2. **Isolamento antes da busca.** O PRD exige que o filtro do usuário seja aplicado antes da recuperação, não depois. No PostgreSQL, o filtro faz parte da mesma query de cada estratégia. Com um índice externo, o isolamento depende de replicar `space_id` corretamente em outro sistema.
3. **O modelo é relacional e precisa de integridade.** Usuário → espaço → fonte → mensagem → trecho → evidência. A idempotência da ingestão depende de chaves únicas parciais. A exclusão de uma fonte com todos os derivados (requisito de privacidade) é uma cascata de FKs. A mensagem imutável é um trigger. Em NoSQL, tudo isso viraria código da aplicação.
4. **Os padrões de acesso ainda estão em descoberta.** O DynamoDB pede que os padrões de acesso sejam desenhados antes (single-table design). Na v0.1, as consultas vão mudar a cada experimento; o SQL tolera isso sem remodelar a tabela.
5. **Local First e custo.** O PostgreSQL roda igual na máquina, na CI e em qualquer nuvem. O DynamoDB é ótimo em custo para cargas pequenas, mas não roda de verdade localmente e prende o projeto a um provedor.
6. **Escala.** O volume de uma memória pessoal (milhões de mensagens) cabe com folga em um PostgreSQL.

Quando reavaliar: arquivo bruto de mensagens em volume muito alto (multiusuário, ordem de bilhões de registros) ou operação multi-região. Nesses casos, um armazenamento de log bruto (object storage ou NoSQL) pode ficar ao lado do PostgreSQL, que continua com índice e evidências. Os repositórios atrás de portas na camada de aplicação limitam o impacto dessa mudança.

### 2.6 Geração da resposta

Decidido no esclarecimento: compositor determinístico. A porta `AnswerGenerator` recebe `(pergunta, evidências)` e devolve `AgentReply`; a feature do agente adiciona uma implementação com LLM sem alterar ingestão, busca ou adaptadores.

## 3. Padrões aplicáveis

- **Ports and adapters (hexagonal)** dentro de cada módulo: portas na camada de aplicação, implementações na infraestrutura, composição em `src/main`.
- **Contract testing** consumidor-agnóstico: a suíte `runChannelContractSuite` recebe uma fábrica de adaptador.
- **Transactional enqueue**: gravação e job no mesmo commit (substitui o outbox da spec de ingestão).
- **Schema-first**: JSON Schema e OpenAPI como fonte, tipos gerados e teste de drift.
- **Evidence-bound answering**: o validador de citações rejeita qualquer `message_id` fora dos resultados da busca.

## 4. Fontes externas de referência

- Node.js release schedule (LTS): https://nodejs.org/en/about/previous-releases
- JSON Schema 2020-12: https://json-schema.org/draft/2020-12
- OpenAPI 3.1: https://spec.openapis.org/oas/v3.1.0
- PostgreSQL Full Text Search: https://www.postgresql.org/docs/16/textsearch.html
- pg-boss: https://github.com/timgit/pg-boss
- dependency-cruiser: https://github.com/sverweij/dependency-cruiser
- ESLint `complexity`: https://eslint.org/docs/latest/rules/complexity
- StrykerJS: https://stryker-mutator.io/docs/stryker-js/introduction/
- Testcontainers for Node.js: https://node.testcontainers.org/
- Terraform Docker provider: https://registry.terraform.io/providers/kreuzwerker/docker/latest/docs
- OpenTelemetry JS: https://opentelemetry.io/docs/languages/js/
- lefthook: https://github.com/evilmartians/lefthook
- Semgrep, OSV-Scanner, gitleaks: https://semgrep.dev, https://google.github.io/osv-scanner/, https://github.com/gitleaks/gitleaks

As versões exatas de cada dependência são fixadas no `package.json` e nos providers do Terraform durante o coding, escolhendo versões estáveis publicadas há pelo menos duas semanas.
