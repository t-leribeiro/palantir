# ADR-0009: Adaptador WhatsApp não oficial, isolado, para o número do agente

- Status: aceito
- Data: 2026-11-23
- Decisores: Leandro (produto), reversa-plan
- Origem: `_reversa_forward/003-perguntar-pelo-whatsapp/roadmap.md` (D-01 a D-05, D-14 a D-16, D-20)

## Contexto

A fatia S2 leva as perguntas para o WhatsApp: o usuário escreve do número pessoal para o número do agente (um chip secundário) e recebe a resposta com citações. A API oficial (WhatsApp Business Platform) não conversa com contas pessoais nem acessa grupos pessoais, o que a S3 vai precisar. O usuário decidiu usar **dois números**: um só para o agente (S2) e outro para capturar grupos (S3), para que um bloqueio da captura não derrube o agente.

## Decisão

1. Usar o pacote `baileys` (WhiskeySockets, MIT) na versão exata `7.0.0-rc14`, a tag `latest` do npm em 2026-11-23. Só a linha 7 trata os identificadores de privacidade do WhatsApp (LID): o remetente pode chegar como `@lid`, com o número em `key.remoteJidAlt` ou na tabela `signalRepository.lidMapping`.
2. Isolar a biblioteca em `src/channels/whatsapp/provider/baileys-provider.ts`, atrás da porta `WhatsAppProvider`. A regra `whatsapp-lib-isolated` do dependency-cruiser bloqueia qualquer outro import. Um provedor simulado implementa a mesma porta para a esteira, sem rede nem número.
3. Rodar o canal num processo próprio (`npm run dev:whatsapp`), desligado por padrão (`PALANTIR_WHATSAPP_ENABLED`), com health em `PALANTIR_WHATSAPP_HEALTH_PORT`.
4. Guardar a sessão num único arquivo AES-256-GCM fora do banco e do repositório (`~/.palantir/whatsapp/agent-session.enc`). A chave fica em `PALANTIR_WA_SESSION_KEY`, gerada e preservada pelo `npm run setup`. O `useMultiFileAuthState` do pacote foi descartado: o próprio pacote não o recomenda para produção e ele grava em texto puro.
5. Uso conservador: só responde a quem escreveu, 1 mensagem por segundo por destinatário, silêncio com remetentes desconhecidos, sem presença online nem sincronização de histórico, logger da biblioteca no nível `error` sem objetos.

## Consequências

- Positivas: o produto sai do canal de teste sem tocar no núcleo; trocar de biblioteca ou de versão afeta um arquivo; falhas do WhatsApp não derrubam importação, API nem worker.
- Negativas e riscos:
  - **Bloqueio do número:** uso não oficial pode levar o WhatsApp a banir o chip. Mitigado pelo uso conservador e por ser um chip dedicado.
  - **Versão release candidate:** a linha 7 ainda não tem versão estável. Fixamos a versão exata; a esteira roda OSV-Scanner e Semgrep.
  - **Licença:** a dependência transitiva `libsignal@6.0.0` é **GPL-3.0**. Uso local e pessoal não distribui o software. Distribuir o Palantír com este adaptador exige rever a licença do projeto ou trocar o adaptador.
  - Sem ambiente de teste oficial: a esteira usa o provedor simulado; a validação com o WhatsApp real é manual (`_reversa_forward/003-perguntar-pelo-whatsapp/onboarding.md`).

## Quando revisar

- Sair uma versão estável da linha 7: atualizar e rodar a demonstração manual.
- O chip ser bloqueado mais de uma vez em 30 dias: reavaliar a WhatsApp Business Platform para o número do agente (a interface com o usuário não exige grupos).
- Qualquer intenção de distribuir o Palantír: decidir a licença antes (GPL-3.0 transitiva).
- A S3 (captura) começar: uma segunda sessão, de outro número, com o mesmo isolamento.

## Atualização 2026-11-23: captura de grupos (S3, feature `004`)

- A captura de grupos autorizados entrou no mesmo adaptador, com papéis (`answer`, `capture`) escolhidos por `PALANTIR_WHATSAPP_CAPTURE`: `off` (padrão, igual à S2), `agent` (o número do agente também captura) e `dedicated` (segundo número, sessão própria em `capture-session.enc`, mesma chave).
- **Modo `agent` é provisório**, enquanto não há o segundo chip. Risco aceito pelo usuário: se o WhatsApp bloquear o número por causa da captura, o agente também para de responder. Rollback: `PALANTIR_WHATSAPP_CAPTURE=off`. Passagem para `dedicated`: parear o segundo chip, sair do grupo com o chip do agente e reautorizar o grupo.
- Nenhum número escreve em grupos: `sendText` recusa destino `@g.us` no provedor real e no simulado.
- A biblioteca continua importada só em `baileys-provider.ts`; grupos usam `participant`/`participantAlt`/`lidMapping` para o autor e `groupFetchAllParticipating` para o diretório de grupos.

## Alternativas consideradas

- `baileys@6.7.24` (linha `legacy`): sem tratamento de LID; remetentes novos chegariam sem número.
- `whatsapp-web.js`: precisa de navegador (Puppeteer), mais memória que o limite de 300 MB.
- WhatsApp Business Platform (oficial): sem risco de bloqueio por uso não oficial, mas exige conta comercial e não atende a captura de grupos pessoais da S3. Fica como adaptador futuro.
