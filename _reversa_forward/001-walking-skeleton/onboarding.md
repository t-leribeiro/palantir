# Onboarding: Walking skeleton da platform-foundation

> Identificador: `001-walking-skeleton`
> Para: quem vai testar a feature pela primeira vez
> Os comandos abaixo passam a existir quando o `/reversa-coding` concluir as ações. Até lá, são o comportamento esperado.

## 1. Pré-requisitos

| Ferramenta | Versão | Observação para Windows |
|------------|--------|-------------------------|
| nvm (nvm-windows) | atual | `winget install CoreyButler.NVMforWindows`; mantém o Node 18 dos outros projetos |
| Node.js | 22 LTS | Instalado pelo nvm (ver abaixo); o projeto fixa a versão em `.nvmrc` e recusa outras (`engine-strict`) |
| Docker Desktop | atual, com WSL2 | Necessário para o ambiente local e para o Semgrep |
| Terraform | ≥ 1.9 | `winget install Hashicorp.Terraform` |
| gitleaks | atual | `winget install Gitleaks.Gitleaks` ou `scoop install gitleaks` |
| OSV-Scanner | atual | `scoop install osv-scanner` ou binário da release |
| Git | ≥ 2.40 | |

Node via nvm, sem afetar os outros projetos:

```bash
nvm install 22          # instala a última 22.x ao lado das versões existentes
nvm use 22              # ativa a 22 no terminal atual (o nvm-windows não lê .nvmrc sozinho)
node --version          # deve mostrar v22.x
```

Ao voltar para um projeto que usa o Node 18, rode `nvm use 18`. No nvm-windows, `nvm use` troca a versão para todos os terminais abertos; com o nvm do Linux/macOS (ou WSL), `nvm use` lê o `.nvmrc` e vale só para o terminal atual.

Verifique com `npm run doctor`: o comando lista o que falta e a versão encontrada, e falha se o Node ativo não for 22.

## 2. Subir o ambiente

```bash
npm ci                 # instala dependências e os hooks do lefthook
npm run setup          # terraform init + apply em infra/local (Postgres, SeaweedFS S3, Collector, Prometheus, Tempo, Loki, Grafana) e gera o .env
npm run db:migrate     # aplica as migrações 001 a 004
npm run seed           # cria operador, espaço pessoal, conta fake e "Grupo de teste" autorizado
```

Em outro terminal:

```bash
npm run dev:api        # API em http://localhost:8080 (PALANTIR_FAKE_CHANNEL=true no .env.example)
npm run dev:worker     # worker de jobs
```

Health check: `curl http://localhost:8080/health` → `{"status":"ok"}`.

## 3. Testar o caminho completo

1. Injetar uma mensagem no grupo de teste:

```bash
curl -X POST http://localhost:8080/v1/channels/fake/inbound \
  -H "content-type: application/json" \
  -d '{"conversationId":"fake-group-1","externalMessageId":"m-1","senderId":"ana","senderName":"Ana","text":"O Grafana Alloy centraliza a coleta de telemetria","timestamp":"2026-11-22T10:00:00-03:00"}'
```

2. Perguntar ao agente como o operador:

```bash
curl -X POST http://localhost:8080/v1/channels/fake/agent \
  -H "content-type: application/json" \
  -d '{"senderAccountId":"fake-operator","text":"quem falou do Grafana Alloy?"}'
```

3. Ver a resposta entregue pelo adaptador fake:

```bash
curl http://localhost:8080/v1/channels/fake/outbox
```

Esperado: uma resposta citando Ana, "Grupo de teste" e a data. Pergunte sobre "Temporal" para ver "não encontrei evidências suficientes".

## 4. Observar

- Grafana: http://localhost:3000 (credenciais geradas no setup, exibidas ao final do `npm run setup`)
- Dashboard "Palantír / Walking skeleton": mensagens ingeridas, rejeitadas, duplicadas, latência da pergunta
- Explore → Tempo: o trace da pergunta tem spans `agent.ask`, `retrieval.search` e `pg.query`
- Explore → Loki: logs JSON com `trace_id`, sem conteúdo das mensagens

## 5. Rodar os testes e gates

```bash
npm run lint           # ESLint + complexidade ≤ 10
npm run complexity:report
npm run typecheck
npm run arch           # dependency-cruiser (5 regras)
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:e2e       # requer o ambiente do passo 2
npm run test:mutation
npm run security       # semgrep (docker), osv-scanner, gitleaks
npm run eval           # harness do conjunto de avaliação
npm run dor            # roda localmente todos os itens automáticos da DoR
```

Um único teste: `npx vitest run caminho/do/arquivo.test.ts -t "nome do teste"`.

## 6. Derrubar o ambiente

```bash
npm run teardown       # terraform destroy em infra/local
```
