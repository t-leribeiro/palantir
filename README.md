# Palantír

Personal Knowledge Agent: transforma conversas dispersas (grupos do WhatsApp, incluindo áudios) em uma memória pesquisável, consultada pelo próprio canal, com a fonte de cada resposta. WhatsApp-first, not WhatsApp-only.

Estado: **S6 implementada** (feature `007`): perguntas com outras palavras ou com erro de digitação acham a mensagem, em texto e em áudio transcrito, com o sentido calculado no próprio computador (trocável por um serviço online por configuração). Demonstração manual pendente. A S5 (conta verificada por código e grupos geridos conversando com o agente), a S4 (áudios transcritos localmente e citados com o ponto do trecho) e a S3 (captura ao vivo de um grupo autorizado) estão entregues.

- Produto: [`_reversa_sdd/prd.md`](_reversa_sdd/prd.md) e specs em [`_reversa_sdd/sdd/`](_reversa_sdd/sdd/)
- Plano e status das entregas: [`docs/plano-de-fatias.md`](docs/plano-de-fatias.md)
- Decisões de arquitetura: [`docs/adr/`](docs/adr/README.md)
- Feature atual: [`_reversa_forward/006-gerenciar-grupos-pelo-agente/`](_reversa_forward/006-gerenciar-grupos-pelo-agente/)

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

Gerenciar grupos pelo agente (S5): depois de `npm run db:migrate`, a conta pessoal fica pendente até você mandar ao agente o código que `npm run whatsapp:link -- "<número>"` mostra. Pelo WhatsApp, mande `grupos`, `acompanhar <número ou nome>` (confirme com `confirmo`), `parar <nome>` e `apagar <nome>` (confirme com `confirmo apagar <nome>`); perguntas aceitam o nome do grupo ("em qual áudio do T3..."). Roteiro em [`onboarding.md` da 006](_reversa_forward/006-gerenciar-grupos-pelo-agente/onboarding.md); decisões no [ADR-0011](docs/adr/0011-gestao-de-fontes-pelo-agente.md).

Achar o assunto dito com outras palavras (S6): o `npm run setup` sobe o motor local de embeddings (`:8091`) e grava as variáveis `PALANTIR_EMBEDDER*` no `.env`; baixe os candidatos com `npm run busca:modelos`, escreva as perguntas reais com `npm run eval:busca -- preparar` e meça com `npm run eval:busca -- medir`; escolha o modelo e o limiar (`PALANTIR_SEMANTIC_MIN_SIMILARITY`), rode `npm run setup` de novo e reinicie o worker, que calcula o sentido do histórico sozinho. O `npm run eval` compara a busca por palavra com a combinada, por tipo de pergunta. Roteiro em [`onboarding.md` da 007](_reversa_forward/007-achar-assunto-outras-palavras/onboarding.md); decisões no [ADR-0012](docs/adr/0012-busca-por-sentido-local-substituivel.md).

Ver a mensagem original (S7): depois de uma resposta, mande ao agente "mostra a 2" (ou "ver 2", "original 2") para receber a mensagem 2 inteira, com quem escreveu, a conversa, a data e a hora, mais as 3 mensagens antes e as 3 depois na mesma conversa; se for áudio, vem a transcrição completa com o trecho citado marcado e, em seguida, o próprio áudio como mensagem de voz, só na sua conversa com o agente. Vale por 2 horas depois da resposta. Precisa da migração `0010` (`npm run db:migrate`) e, para o arquivo do áudio, da chave de mídia e do armazenamento da S4 no `.env`. Roteiro em [`onboarding.md` da 008](_reversa_forward/008-mostrar-original-com-contexto/onboarding.md).

Perguntar sobre áudios (S4): o `npm run setup` sobe o motor de transcrição e gera `PALANTIR_MEDIA_KEY`; baixe os modelos com `npm run transcricao:modelos -- <id>`, meça com `npm run eval:transcricao` (preparar, fleurs, medir) e escolha `PALANTIR_TRANSCRIBER_MODEL` (padrão: `deepdml/faster-whisper-large-v3-turbo-ct2`); importe o export **com mídias** e pergunte "em qual áudio falaram de X?" (roteiro em [`onboarding.md` da 005](_reversa_forward/005-perguntar-sobre-audios/onboarding.md); decisões no [ADR-0010](docs/adr/0010-transcricao-local-substituivel.md)).

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
| `npm run whatsapp:link -- "<número>"` | Cadastra o número pessoal na conta WhatsApp do dono e mostra o código de 6 dígitos que o dono manda ao agente para verificar a conta (S5) |
| `npm run dev:whatsapp` | Processo do número do agente; desligado por padrão (`PALANTIR_WHATSAPP_ENABLED`); captura de grupos com `PALANTIR_WHATSAPP_CAPTURE` (`off`, `agent`, `dedicated`) |
| `npm run whatsapp:grupos -- [listar \| autorizar <grupo> --consentimento "<texto>" [--conversa "<nome>"] \| revogar <grupo> \| apagar <grupo> --nome "<nome>"]` | Lista, autoriza (com consentimento), revoga e apaga grupos, com auditoria; lê só do banco |
| `npm run auditoria -- [--desde AAAA-MM-DD] [--limite N]` | Mostra a auditoria de vínculos, verificações, autorizações e exclusões, sem conteúdo |
| `npm run transcricao:modelos -- <id> [<id>...]` | Baixa modelos no motor de transcrição local (ex.: `deepdml/faster-whisper-large-v3-turbo-ct2`) |
| `npm run eval:transcricao -- <preparar <export.zip> \| fleurs \| medir --modelos <ids>>` | Mede os modelos (WER, tempo real, memória) em `exports/medicao/`; a saída só tem números |
| `npm run busca:modelos -- [<id>...]` | Baixa modelos de embeddings para o motor local (sem argumentos, os candidatos da medição) |
| `npm run eval:busca -- <preparar\|medir>` | Prepara as perguntas reais em `exports/medicao/busca/` e mede cada modelo candidato, só com números (S6) |
| `npm run media:conferir` | Confere que os áudios guardados estão cifrados e decifram com a chave do `.env`, e que não sobrou objeto de conversa apagada |
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
