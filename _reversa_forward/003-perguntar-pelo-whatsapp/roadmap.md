# Roadmap: Perguntar pelo WhatsApp ao número do agente (fatia S2)

> Identificador: `003-perguntar-pelo-whatsapp`
> Data: `2026-11-23`
> Requirements: `_reversa_forward/003-perguntar-pelo-whatsapp/requirements.md`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA

## 1. Resumo da abordagem

Um novo adaptador de canal, `src/channels/whatsapp/`, conecta o chip secundário ao WhatsApp por uma biblioteca não oficial. Ela fica isolada atrás de uma porta pequena, `WhatsAppProvider`, e só um arquivo do projeto a importa. O adaptador roda num **processo próprio** (`npm run dev:whatsapp`), ligado por configuração. Ele guarda a sessão num arquivo local criptografado e entrega ao agente só mensagens diretas de texto. A resposta volta formatada e em partes, com 1 mensagem por segundo. O núcleo muda pouco: o agente ganha a ajuda (RF-14) e a política de silêncio para remetente desconhecido (RF-05), e a identidade ganha o cadastro do número por comando (RF-03). Na esteira, um provedor simulado substitui o WhatsApp, e a mesma suíte de contrato do canal roda para o adaptador fake e para o WhatsApp. Com o chip real, a demonstração é manual e segue o `onboarding.md`.

## 2. Princípios aplicados

Não há `.reversa/principles.md` neste projeto. Valem os requisitos de engenharia do `CLAUDE.md` (fonte: `requirements.md`).

| Princípio | Como a feature se relaciona | Status |
|-----------|------------------------------|--------|
| WhatsApp-first, not WhatsApp-only | Biblioteca só em `src/channels/whatsapp/provider/baileys-provider.ts`; o núcleo continua sem importar `src/channels/**` (regra `core-no-channels`) | respeita |
| Evidence over hallucination | Mesma geração de resposta com citações; a divisão em partes nunca corta uma citação (RF-08) | respeita |
| Security First / Local First | Sessão criptografada com AES-256-GCM, chave no `.env` gerada pelo setup e arquivo fora do repositório; números mascarados e textos fora dos logs; tudo roda local | respeita |
| API First / Documentation First | Contrato `AgentReply` 1.2.0 (schema primeiro), interfaces em `interfaces/`, ADR-0009 antes do código | respeita |
| TDD e pirâmide de testes | Unitários (normalização de número, renderização, ritmo, sessão), contrato (os dois adaptadores), integração (cadastro e recibos no PostgreSQL), E2E com provedor simulado, mutação | respeita |
| Testes de arquitetura e complexidade ≤ 10 | Nova regra: só `baileys-provider.ts` importa o pacote do WhatsApp | respeita |
| Custo baixo / local | Sem serviço pago; biblioteca MIT | respeita, com ressalva de licença (D-02) |

## 3. Decisões técnicas

| ID | Decisão | Justificativa | Alternativas descartadas | Confidência |
|----|---------|----------------|--------------------------|-------------|
| D-01 | Usar o pacote `baileys` na versão exata `7.0.0-rc14` (tag `latest` do npm) | É a linha que trata os novos identificadores de privacidade do WhatsApp (LID): `WAMessageKey.remoteJidAlt` e `signalRepository.lidMapping.getPNForLID` existem nos tipos do pacote. A `6.7.24` ficou como `legacy`. Node ≥ 20, ESM e MIT, compatível com o projeto | `6.7.24` (sem tratamento de LID); `whatsapp-web.js` (navegador, mais memória); API oficial (não acessa a conversa pessoal; fica como adaptador futuro) | 🟡 |
| D-02 | Registrar em ADR-0009 que a dependência transitiva `libsignal@6.0.0` é GPL-3.0 | Uso local e pessoal não distribui o software. Distribuir o Palantír com esse adaptador exigiria licença compatível ou trocar o adaptador | Ignorar (risco jurídico escondido) | 🟢 |
| D-03 | Porta `WhatsAppProvider` (conectar, eventos de QR, estado, mensagem recebida já normalizada, enviar texto) com duas implementações: `baileys-provider.ts` e `simulated-provider.ts` | Isola a biblioteca não oficial, permite a suíte de contrato e o E2E sem rede (RF-13) e facilita trocar de biblioteca | Usar a biblioteca direto no adaptador (testes só com mocks profundos) | 🟢 |
| D-04 | Processo próprio `src/main/whatsapp.ts` (`npm run dev:whatsapp`), com papel `whatsapp`, servidor HTTP só de health na porta `PALANTIR_WHATSAPP_HEALTH_PORT` (padrão 8081) e `PALANTIR_WHATSAPP_ENABLED` (padrão `false`) | A spec pede processo próprio; queda ou bloqueio do número não derruba API nem worker (RNF de disponibilidade); memória medível (≤ 300 MB); liga e desliga por configuração (RF-12) | Rodar dentro da API (mistura falhas; dificulta medir memória) | 🟢 |
| D-05 | Sessão num único arquivo `agent-session.enc`, criptografado com AES-256-GCM (`node:crypto`, nonce aleatório por gravação, autenticado). A chave de 32 bytes fica em `PALANTIR_WA_SESSION_KEY` no `.env`, gerada pelo `npm run setup` se faltar. A pasta é `PALANTIR_WA_SESSION_DIR`, padrão `~/.palantir/whatsapp/`. Gravação atômica (arquivo temporário e troca de nome) e agrupada em até 1 s | Esclarecimento de 2026-11-23: fora do banco, sobrevive à recriação do ambiente. O próprio pacote avisa que o `useMultiFileAuthState` não serve para produção ("I wouldn't endorse this for any production level use"). Guardar credenciais e as chaves do Signal (inclusive `lid-mapping`) num estado próprio criptografado | `useMultiFileAuthState` (texto puro, muitos arquivos); tabela no PostgreSQL (some com o teardown) | 🟢 |
| D-06 | Identificar o remetente pelo número em E.164 (`+5511988887777`). Se `key.remoteJid` termina em `@lid`, usar `key.remoteJidAlt`; sem ele, `lidMapping.getPNForLID`. Sem número resolvido, o remetente é desconhecido (silêncio e métrica `reason=unresolved`) | O cadastro (RF-03) é por número; a chave da conta é (`whatsapp`, E.164) | Cadastrar pelo LID (o usuário não sabe o próprio LID) | 🟡 |
| D-07 | Normalizar celulares brasileiros: um número `55` + DDD + 8 dígitos começando com 6 a 9 recebe o nono dígito, tanto no cadastro quanto no remetente | Contas antigas do Brasil aparecem no WhatsApp sem o nono dígito; sem isso, o seu número não seria reconhecido | Comparar duas variantes a cada busca (lógica espalhada) | 🟡 |
| D-08 | Comando `npm run whatsapp:link -- <número> [--dono <provedor:conta>]` (padrão `fake:fake-operator`, como o `import`). Caso de uso `linkWhatsAppNumber` no módulo `identity`: transforma a conta `pending` `unlinked:<user_id>` do dono em `active` com o número; se não existir, cria a conta. Número de outro usuário: erro `already_linked`, sem revelar quem | RF-03, RN-03 e RN-07. A conta continua sendo a dona das conversas importadas (`ensurePendingAccount` já procura a conta do usuário pelo provedor, então importações futuras usam a mesma conta) | Criar conta nova e migrar as fontes (mais escrita, mais risco) | 🟢 |
| D-09 | Política de remetente desconhecido no agente: `createAskQuestion({ unknownSender: "reply" \| "silent" })`, e `AgentHandler` passa a devolver `AgentReply \| null` (`null` = não responder). O canal fake continua `reply`; o WhatsApp usa `silent` | RF-05 com o esclarecimento D2. A decisão fica no núcleo, depois de resolver a identidade (RF-01 do `conversational-agent`), e nenhum adaptador precisa saber de identidade | Adaptador consultar a identidade (duplica regra no canal) | 🟢 |
| D-10 | Ajuda (RF-14) no domínio do agente: texto normalizado (minúsculas, sem acento nem pontuação) igual a um cumprimento ou pedido de ajuda (`oi`, `ola`, `bom dia`, `boa tarde`, `boa noite`, `ajuda`, `help`, `menu`, `?`) gera `AgentReply` com o novo `outcome: "help"`, sem busca. Contrato `AgentReply` 1.2.0, mudança aditiva | Sem a ajuda, "oi" vira "Não encontrei evidências suficientes."; o valor novo deixa a métrica e os testes distinguirem ajuda de falta de evidência | Usar `answered` (o contrato exige citações em `answered`) | 🟢 |
| D-11 | Renderizador do WhatsApp em `src/channels/whatsapp/render.ts`: negrito `*`, itálico `_`, partes de no máximo 4.000 caracteres quebradas em fim de linha, prefixo `(1/3)` quando houver mais de uma parte. A divisão atual (`splitForChannel`) passa para `src/channels/shared/split.ts` e o fake passa a usá-la de lá | RF-08; reaproveita a quebra por linha que já não corta citações | Copiar a função (DRY) | 🟢 |
| D-12 | Ritmo de envio: fila por destinatário com intervalo mínimo de 1 s entre partes, relógio injetável para testes | RF-09; diminui o risco de bloqueio. O README do pacote desencoraja envio automatizado em massa | Usar a fila interna do pacote (dependência transitiva, sem garantia) | 🟢 |
| D-13 | Recibos de pergunta: tabela `agent_inbound_receipts(provider, external_message_id, received_at)`, com chave nas duas primeiras colunas e sem conteúdo. Uma pergunta só é respondida se o recibo for inserido agora; recibos com mais de 7 dias são apagados ao iniciar o processo. Mensagens com mais de 10 min na chegada são ignoradas (fila antiga após muito tempo desligado) | RF-10: o WhatsApp reentrega na reconexão e após reiniciar; um cache em memória perderia isso. RN-04: guarda só o id | Cache em memória (duplica após reiniciar); guardar a pergunta (viola RN-04) | 🟢 |
| D-14 | Reconexão: queda com motivo diferente de `DisconnectReason.loggedOut` (401) reconecta com espera de 1, 2, 4, ... até 60 s, com variação aleatória; `restartRequired` (515) reconecta na hora. `loggedOut` apaga o arquivo de sessão, marca `logged_out`, registra aviso "pareie de novo" e não tenta mais | RF-10, RF-11, EC-01 da spec | Reconectar sempre (insistir com número bloqueado aumenta o risco) | 🟢 |
| D-15 | QR Code: o evento `connection.update` traz `qr`; o processo desenha o QR no terminal com o pacote `qrcode` (MIT) e escreve direto na saída padrão, **nunca no logger** (o QR dá acesso à conta e não pode ir para o Loki) | `printQRInTerminal` foi removido no pacote ("@deprecated This feature has been removed"); RF-01 e RNF de segurança | Logar o QR (vazaria para a observabilidade) | 🟢 |
| D-16 | Opções da conexão: `markOnlineOnConnect: false`, `syncFullHistory: false`, `shouldIgnoreJid` para grupos, listas de transmissão, status e canais, e o logger do pacote em nível `error` sem conteúdo de mensagens | RN-01 (o número do agente não captura) e RNF de privacidade; menos tráfego, menos risco | Padrões do pacote (sincroniza histórico, logs verbosos) | 🟡 |
| D-17 | Mensagens tratadas: texto (`conversation` ou `extendedTextMessage.text`) vai ao agente; áudio, imagem, documento, vídeo e figurinha recebem "Por enquanto eu só entendo mensagens de texto." (só para remetente cadastrado); reação, mensagem de protocolo e mensagem enviada pelo próprio número (`fromMe`) são ignoradas | RF-06 | Responder qualquer coisa (ruído e risco) | 🟢 |
| D-18 | Observabilidade: métricas `whatsapp_session_state{state}` (gauge), `whatsapp_messages_received_total{kind}`, `whatsapp_replies_sent_total`, `whatsapp_unknown_senders_total{reason}` e `whatsapp_reconnects_total`; painel novo no Grafana; regra de alerta do Prometheus `WhatsAppLoggedOut`; números só mascarados nos logs (`maskPhone`) | RNF de observabilidade e privacidade | Só logs (sem painel nem alerta) | 🟡 |
| D-19 | Suíte de contrato respeita as capacidades: testes de captura só rodam quando `supportsLiveCapture` é verdadeiro. O WhatsApp da S2 declara `supportsLiveCapture: false`, `supportsMedia: false` e `maxMessageLength: 4000` | RN-01: o número do agente não captura; a suíte continua valendo para os dois adaptadores (RF-13) | Fingir captura no WhatsApp para passar na suíte | 🟢 |
| D-20 | Nova regra de arquitetura `whatsapp-lib-isolated`: só `src/channels/whatsapp/provider/baileys-provider.ts` importa `baileys` | Garante o isolamento de D-03 nos gates de commit e merge | Confiar em revisão | 🟢 |

## 4. Premissas

Nenhuma premissa de `[DÚVIDA]`: as 4 dúvidas foram resolvidas em `requirements.md#9. Esclarecimentos`. Premissas técnicas que a demonstração com o chip confirma:

| Premissa | Origem (`requirements.md` seção) | Risco se errada |
|----------|----------------------------------|-----------------|
| Conversas 1:1 trazem o número em `remoteJidAlt` ou na tabela de LID | 5. RF-04 | O seu número não seria reconhecido; mitigação: o log mostra `reason=unresolved` e o plano B é guardar o LID visto no primeiro contato do número cadastrado (aviso ao operador) |
| A versão `7.0.0-rc14` conecta e envia sem ajustes | 5. RF-01, RF-04 | Trocar para outra rc ou para a `6.7.24`, isolado em `baileys-provider.ts` |

## 5. Delta arquitetural

Não há `architecture.md`: componentes conforme `_reversa_sdd/sdd/` e os adendos vigentes.

| Componente | Arquivo de origem no legado | Tipo de mudança | Resumo |
|------------|------------------------------|-----------------|--------|
| `whatsapp-baileys-adapter` | `_reversa_sdd/sdd/whatsapp-baileys-adapter.md` | componente-novo | Só interface do agente: pareamento, sessão criptografada, mensagens diretas de texto, renderização, ritmo, reconexão, estado. Captura e mídia ficam para S3 e S4 |
| `conversational-agent` | `_reversa_sdd/sdd/conversational-agent.md#6. Requisitos Funcionais` | regra-alterada | Ajuda (`help`) e política de remetente desconhecido (`silent`); `AgentHandler` devolve `AgentReply \| null` |
| `identity-and-sources` | `_reversa_sdd/sdd/identity-and-sources.md#6. Requisitos Funcionais` | regra-nova | Cadastro do número por comando (sem código; verificação na S5) e normalização E.164 com o nono dígito |
| `channel-contract` | `_reversa_sdd/sdd/channel-contract.md` | contrato-alterado | `AgentReply` 1.2.0 com `outcome: "help"`; suíte de contrato condicionada às capacidades |
| `platform-foundation` | `_reversa_sdd/sdd/platform-foundation.md` | regra-alterada | Papel `whatsapp` na configuração, chave da sessão gerada no setup, painel, alerta e regra de arquitetura nova |

## 6. Delta no modelo de dados

- Resumo das mudanças: uma tabela nova sem conteúdo (`agent_inbound_receipts`, migração `0005`) e a conta `whatsapp` do dono passando de `unlinked:<user_id>`/`pending` para o número/`active` pelo comando. A sessão do WhatsApp não fica no banco.
- Detalhe completo em: `_reversa_forward/003-perguntar-pelo-whatsapp/data-delta.md`

## 7. Delta de contratos externos

| Contrato | Tipo | Arquivo de detalhe |
|----------|------|--------------------|
| `AgentReply` 1.2.0 | schema JSON (contrato do canal) | `_reversa_forward/003-perguntar-pelo-whatsapp/interfaces/agent-reply-1.2.md` |
| Sessão e mensagens do WhatsApp (provedor externo) e health do processo | biblioteca + HTTP | `_reversa_forward/003-perguntar-pelo-whatsapp/interfaces/whatsapp-provider.md` |
| Comandos `dev:whatsapp` e `whatsapp:link` | linha de comando | `_reversa_forward/003-perguntar-pelo-whatsapp/interfaces/cli-whatsapp.md` |

## 8. Plano de migração

1. `npm run db:migrate` aplica a `0005_agent_inbound_receipts.sql` (aditiva, sem tocar dados).
2. `npm run setup` acrescenta `PALANTIR_WA_SESSION_KEY` ao `.env` se faltar, sem mudar as outras variáveis.
3. O operador roda `npm run whatsapp:link -- +55...` uma vez; as conversas importadas continuam na mesma conta.
4. Rollback: `PALANTIR_WHATSAPP_ENABLED=false` (nada conecta); a tabela nova pode ficar.

## 9. Riscos e mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| Bloqueio do chip pelo WhatsApp | alto | médio | Só responde a quem escreveu; 1 mensagem/s; silêncio com desconhecidos; sem histórico nem presença online; chip secundário dedicado |
| Biblioteca em versão rc quebra após mudança do WhatsApp | alto | médio | Versão exata; isolada em um arquivo; o restante do produto segue funcionando; trocar de versão sem mexer no núcleo |
| Número do remetente não resolvido (LID) | médio | médio | D-06 com dois caminhos e métrica `unresolved`; plano B na seção 4 |
| Vazamento de credenciais ou do QR | alto | baixo | AES-256-GCM; QR só no terminal; regra de redação do logger; teste que procura o conteúdo da sessão nos logs |
| Licença GPL-3.0 transitiva | médio | baixo (uso local) | ADR-0009; reavaliar antes de qualquer distribuição |
| Pacote com nova dependência vulnerável | médio | médio | OSV-Scanner e Semgrep na esteira e na DoR bloqueiam críticos e altos |
| Resposta dupla após reconexão | baixo | médio | Recibos no banco (D-13) |

## 10. Critério de pronto

- [ ] Todas as ações do `actions.md` marcadas `[X]`
- [ ] `cross-check.md` (se executado) sem CRITICAL nem HIGH
- [ ] `regression-watch.md` gerado
- [ ] `npm run dor` verde, com a suíte de contrato rodando para o fake e o WhatsApp simulado
- [ ] Demonstração manual com o chip, seguindo o `onboarding.md`: parear, cadastrar o número, perguntar sobre o histórico importado, "oi", áudio e reinício sem novo QR
- [ ] ADR-0009 escrito; `docs/plano-de-fatias.md` com a S2 entregue e a decisão dos dois números
- [ ] Re-extração reversa executada e sem regressão vermelha (recomendado, não obrigatório)

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-23 | Versão inicial gerada por `/reversa-plan` | reversa |
