# Actions: Perguntar pelo WhatsApp ao número do agente (fatia S2)

> Identificador: `003-perguntar-pelo-whatsapp`
> Data: `2026-11-23`
> Roadmap: `_reversa_forward/003-perguntar-pelo-whatsapp/roadmap.md`

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de ações | 17 |
| Paralelizáveis (`[//]`) | 11 |
| Maior cadeia de dependência | 6 (T001 → T011 → T012 → T014 → T015 → T017) |

Prática: TDD. Os testes da Fase 2 vêm antes das implementações da Fase 3; as demais ações escrevem o teste antes do código no mesmo bloco.

Tamanho: 17 ações, acima das ~15 da regra das fatias (`docs/plano-de-fatias.md`). É a primeira integração com um serviço externo real, com sessão, reconexão e segurança próprias; dividir a S2 deixaria uma entrega sem resultado visível.

## Fase 1, Preparação

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T001 | Contrato `AgentReply` 1.2.0 com `outcome: "help"`, `CONTRACT_VERSION` 1.2.0, tipos regenerados, `AgentHandler` devolvendo `AgentReply \| null` e testes do validador (`help` válido sem citações, valor desconhecido inválido) | - | `[//]` | `contracts/channel/agent-reply.schema.json` | 🟢 | `[X]` |
| T002 | Instalar `baileys@7.0.0-rc14` e `qrcode` com versão exata e criar a regra de arquitetura `whatsapp-lib-isolated` (só `src/channels/whatsapp/provider/baileys-provider.ts` importa `baileys`), com fixture que prova a violação | - | `[//]` | `.dependency-cruiser.cjs` | 🟡 | `[X]` |
| T003 | Configuração do papel `whatsapp`: `PALANTIR_WHATSAPP_ENABLED`, `PALANTIR_WA_SESSION_KEY` (32 bytes base64, validada), `PALANTIR_WA_SESSION_DIR` e `PALANTIR_WHATSAPP_HEALTH_PORT` em `config.ts` e `.env.example`; o `npm run setup` gera a chave se ela faltar no `.env`, sem tocar nas outras variáveis; testes da configuração | - | `[//]` | `src/platform/config.ts` | 🟢 | `[X]` |
| T004 | Migração `0005_agent_inbound_receipts.sql` e repositório de recibos (`registerIfNew`, `purgeOlderThan`) com teste de integração: segundo registro do mesmo id devolve falso, limpeza apaga só os de mais de 7 dias | - | `[//]` | `migrations/0005_agent_inbound_receipts.sql` | 🟢 | `[X]` |

## Fase 2, Testes

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T005 | Testes unitários do canal: número em E.164 (com `+`, espaços, hífens, nono dígito brasileiro, inválidos), máscara do número, renderização (negrito, partes ≤ 4.000 com `(1/3)`, citação nunca cortada) e ritmo (≥ 1 s entre partes por destinatário, destinatários independentes, relógio falso) | - | `[//]` | `test/unit/whatsapp/` | 🟢 | `[X]` |
| T006 | Testes unitários do núcleo: ajuda para `oi`, `Olá!`, `ajuda`, `help` (sem busca, ≤ 600 caracteres, ≥ 2 exemplos); política `silent` devolve `null` sem busca e `reply` mantém a resposta de não vinculado; `linkWhatsAppNumber` com repositório falso (ativa a conta provisória, idempotente, `already_linked` sem revelar o dono, cria a conta se não existir) | T001 | `[//]` | `test/unit/agent/`, `test/unit/identity/` | 🟢 | `[X]` |

## Fase 3, Núcleo

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T007 | Identidade: normalização de número no domínio, caso de uso `linkWhatsAppNumber`, repositório PostgreSQL (teste de integração: conversas importadas continuam na conta) e comando `npm run whatsapp:link -- <número> [--dono]` com saída mascarada e erros do `interfaces/cli-whatsapp.md` | T005, T006 | - | `src/modules/identity/application/link-whatsapp-number.ts` | 🟢 | `[X]` |
| T008 | Agente: detecção de cumprimento ou ajuda no domínio (`helpReply`) e opção `unknownSender: "reply" \| "silent"` em `createAskQuestion`; o canal fake e a composição atual continuam com `reply` | T001, T006 | - | `src/modules/agent/application/ask-question.ts` | 🟢 | `[X]` |
| T009 | Peças do canal: mover `splitForChannel` para `src/channels/shared/split.ts` (o fake passa a importar de lá), renderizador do WhatsApp e fila de envio por destinatário, fazendo os testes de T005 passarem | T005 | `[//]` | `src/channels/whatsapp/render.ts` | 🟢 | `[X]` |
| T010 | Sessão criptografada: estado de autenticação próprio que guarda credenciais e todas as chaves num arquivo AES-256-GCM, com gravação atômica agrupada em até 1 s e remoção em `logged_out`; testes de ida e volta, arquivo sem texto puro, chave errada com erro claro e escrita interrompida sem corromper | T003 | `[//]` | `src/channels/whatsapp/session/encrypted-file-auth-state.ts` | 🟢 | `[X]` |
| T011 | Porta `WhatsAppProvider` (QR, estado, mensagem direta normalizada, envio) e `simulated-provider.ts` para testes (injetar mensagem, queda, logout e reentrega; registrar envios) | T001 | `[//]` | `src/channels/whatsapp/provider/provider.ts` | 🟢 | `[X]` |
| T012 | Adaptador `KnowledgeChannel` do WhatsApp: recibo antes de responder, mensagem com mais de 10 min ignorada, texto ao agente, aviso para não texto só a cadastrados, `null` = silêncio, envio por renderizador e fila; suíte de contrato condicionada às capacidades e rodando para o WhatsApp com o provedor simulado | T004, T009, T011 | - | `src/channels/whatsapp/whatsapp-channel.ts` | 🟢 | `[X]` |

## Fase 4, Integração

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T013 | Provedor real: conexão com as opções de D-16, QR pelo evento `connection.update`, estados, backoff de 1 a 60 s com variação, `loggedOut` apaga a sessão e para, `restartRequired` reconecta, remetente por `remoteJidAlt` ou `lidMapping.getPNForLID`; testes unitários das funções puras (JID para E.164, cálculo do backoff, classificação do tipo de mensagem) | T002, T010, T011 | - | `src/channels/whatsapp/provider/baileys-provider.ts` | 🟡 | `[X]` |
| T014 | Processo `src/main/whatsapp.ts` e composição: identidade, busca, agente com `silent`, recibos com limpeza no início, health em `PALANTIR_WHATSAPP_HEALTH_PORT` com o estado da sessão, QR desenhado no terminal fora do logger, saída limpa quando desligado; script `npm run dev:whatsapp` | T003, T004, T007, T008, T012, T013 | - | `src/main/whatsapp.ts` | 🟡 | `[X]` |
| T015 | E2E com provedor simulado e PostgreSQL real: pergunta do número cadastrado recebe resposta com autor, conversa e data do histórico importado; `oi` recebe a ajuda; desconhecido não recebe nada; reentrega gera uma resposta só; áudio recebe o aviso; mensagem de grupo é ignorada; canal desligado não conecta | T014 | `[//]` | `test/e2e/whatsapp-agent.test.ts` | 🟢 | `[X]` |

## Fase 5, Polimento

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T016 | Observabilidade: métricas `whatsapp_*` do D-18, painel "WhatsApp" no Grafana, regra de alerta `WhatsAppLoggedOut` no Prometheus, `maskPhone` em todos os logs do canal e teste que procura número, texto da pergunta e conteúdo da sessão nos logs capturados | T014 | `[//]` | `src/channels/whatsapp/observability.ts` | 🟡 | `[X]` |
| T017 | Documentação: ADR-0009 (adaptador WhatsApp não oficial, versão rc, licença GPL-3.0 transitiva, sessão em arquivo, critérios para trocar), `CLAUDE.md` e `AGENTS.md` com os comandos novos, `README.md` e `docs/plano-de-fatias.md` com a decisão dos dois números | T015, T016 | - | `docs/adr/0009-adaptador-whatsapp-nao-oficial.md` | 🟢 | `[X]` |

## Notas de execução

- T003: o `npm run setup` reescrevia o `.env` inteiro a cada execução; isso geraria chave nova e exigiria novo pareamento. Agora `scripts/env-file.mjs` preserva `PALANTIR_WHATSAPP_ENABLED`, `PALANTIR_WA_SESSION_KEY`, `PALANTIR_WA_SESSION_DIR` e `PALANTIR_WHATSAPP_HEALTH_PORT` do `.env` anterior.
- T004: os recibos ficaram no módulo `agent` (`InboundReceipts`), injetados no adaptador pela composição.
- T005/T007: a normalização de número ficou em `src/shared/phone.ts`, usada pela identidade (cadastro) e pelo canal (remetente), para os dois lados compararem a mesma forma.
- T008: o aviso "Por enquanto eu só entendo mensagens de texto." também ficou no agente (`textOnlyReply`), depois da identidade: assim desconhecidos não recebem nem o aviso, e o canal não precisa saber quem é cadastrado.
- T010: o arquivo criptografado é genérico (`session/encrypted-file-store.ts`, guarda um texto); a serialização das credenciais e chaves do WhatsApp (`createPersistedAuthState`) ficou em `baileys-provider.ts`, por causa da regra `whatsapp-lib-isolated`.
- T014: o health da plataforma passou a aceitar os estados de sessão (`pairing`, `connected`, `reconnecting`, `logged_out`); só `ok` e `connected` contam como saudável. OpenAPI atualizada.
- T015: mensagens de grupo são descartadas no provedor real (`isIgnoredJid`), coberto em `test/unit/whatsapp/mapping.test.ts`; o provedor simulado só entrega mensagens 1:1.
- T016: nenhum log do canal contém número: nada loga número; o comando `whatsapp:link` mostra o número mascarado. O teste do E2E procura número e texto das perguntas em todas as linhas de log.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-23 | Versão inicial gerada por `/reversa-to-do` | reversa |
