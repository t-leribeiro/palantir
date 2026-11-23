# Investigação: Perguntar pelo WhatsApp ao número do agente (S2)

> Data: 2026-11-23. Fontes consultadas nesta data; versões podem mudar.

## 1. Biblioteca do WhatsApp

Fonte: metadados do npm (`npm view baileys`) e o pacote `baileys-7.0.0-rc14.tgz` inspecionado sem instalar no projeto.

| Item | Valor observado |
|------|-----------------|
| Tags | `latest` = `7.0.0-rc14`, `legacy` = `6.7.24` |
| Node | `engines.node >= 20.0.0` (script `preinstall` só confere a versão do Node) |
| Módulo | `"type": "module"` (ESM), compatível com o projeto |
| Licença | MIT |
| Dependências diretas | `@cacheable/node-cache`, `@hapi/boom`, `async-mutex`, `libsignal@^6.0.0`, `lru-cache`, `music-metadata`, `p-queue`, `pino`, `protobufjs`, `whatsapp-rust-bridge@0.5.4` (WASM, MIT), `ws` |
| Dependências opcionais | `audio-decode`, `jimp`, `link-preview-js`, `sharp` (não necessárias na S2) |
| Licença transitiva | `libsignal@6.0.0` é **GPL-3.0** (WhiskeySockets/libsignal-node) |

### Identificadores de privacidade (LID)

Os tipos do pacote mostram que a mensagem pode chegar endereçada por LID:

- `WAMessageKey` tem `remoteJidAlt`, `participantAlt` e `addressingMode` (`lib/Types/Message.d.ts`)
- `LIDMappingStore.getPNForLID(lid)` e `getLIDForPN(pn)` (`lib/Signal/lid-mapping.d.ts`), acessível por `signalRepository.lidMapping` (`lib/Types/Signal.d.ts`)
- utilitários `isLidUser`, `isJidGroup`, `jidNormalizedUser` (`lib/WABinary/jid-utils.d.ts`)
- o estado de chaves inclui `'lid-mapping'`, `'device-list'`, `tctoken` e `'identity-key'` em `SignalDataTypeMap` (`lib/Types/Auth.d.ts`): o armazenamento próprio precisa persistir todos os tipos, não só `creds`

### Sessão e pareamento

- `useMultiFileAuthState` existe, mas o próprio pacote diz: "I wouldn't endorse this for any production level use other than perhaps a bot" (`lib/Utils/use-multi-file-auth-state.d.ts`)
- `printQRInTerminal`: "@deprecated This feature has been removed" (`lib/Types/Socket.d.ts`); o QR chega no campo `qr` do evento `connection.update` (`lib/Types/State.d.ts`)
- `DisconnectReason`: `loggedOut = 401`, `connectionReplaced = 440`, `badSession = 500`, `restartRequired = 515` (`lib/Types/index.d.ts`)

### Uso responsável

O README oficial (github.com/WhiskeySockets/Baileys) diz que o projeto não é afiliado ao WhatsApp, pede "Do not spam people with this" e desencoraja "bulk or automated messaging usage". A S2 só responde a quem escreveu, com ritmo de 1 mensagem/s.

## 2. Alternativas avaliadas

| Alternativa | Prós | Contras | Veredito |
|-------------|------|---------|----------|
| `baileys` 7.0.0-rc14 | Sem navegador, pouca memória, trata LID, ESM, MIT | Versão rc, não oficial, GPL transitiva | **Escolhida**, isolada e com versão exata |
| `baileys` 6.7.24 (`legacy`) | Linha estável antiga | Sem tratamento de LID: remetentes novos chegariam sem número | Descartada |
| `whatsapp-web.js` | Comunidade grande | Precisa de navegador (Puppeteer), mais memória que o limite de 300 MB | Descartada (spec, decision log) |
| WhatsApp Cloud API (oficial) | Oficial, sem risco de bloqueio por uso não oficial | Exige conta comercial e número dedicado da API; não atende a captura de grupos pessoais da S3 | Adaptador futuro (NG-03 da spec) |

## 3. Padrões aplicados

- **Porta e adaptador**: `WhatsAppProvider` separa a biblioteca do adaptador `KnowledgeChannel` (ADR-0001, ADR-0004).
- **Criptografia autenticada**: AES-256-GCM do `node:crypto` com nonce de 12 bytes por gravação e tag de 16 bytes; troca da chave invalida a sessão (novo pareamento).
- **Idempotência por recibo**: inserir o recibo antes de responder; conflito significa pergunta já tratada.
- **Backoff exponencial com variação aleatória** para reconexão, teto de 60 s.
- **Fila por destinatário** com intervalo mínimo, relógio injetável.

## 4. Números de telefone

- Formato canônico: E.164 com `+`, só dígitos depois dele (8 a 15).
- Brasil: celulares antigos aparecem no WhatsApp sem o nono dígito (`55` + DDD + 8 dígitos começando por 6 a 9). A normalização insere o 9 nesses casos, no cadastro e no remetente.
- O JID de conversa 1:1 é `<dígitos>@s.whatsapp.net`; para enviar, usa-se o JID do remetente recebido. Assim o envio respeita a forma que o próprio WhatsApp usou, inclusive sem o nono dígito.

## 5. Fontes

- npm: `https://www.npmjs.com/package/baileys` (metadados via `npm view`, 2026-11-23)
- Repositório: `https://github.com/WhiskeySockets/Baileys` (README: licença, aviso de uso, link da migração para 7.0.0)
- Pacote inspecionado: `baileys-7.0.0-rc14.tgz` (`lib/Types/*.d.ts`, `lib/Signal/lid-mapping.d.ts`, `lib/Utils/use-multi-file-auth-state.d.ts`)
- `libsignal@6.0.0` no npm (licença GPL-3.0)
