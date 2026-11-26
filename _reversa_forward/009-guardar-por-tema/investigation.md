# Investigation: Guardar um conteúdo com tema (fatia S8)

> Identificador: `009-guardar-por-tema`
> Data: `2026-11-26`

## 1. O que o código faz hoje com o que chega ao agente

- `whatsapp-channel.ts` (`toCanonical`) manda toda mensagem direta com `isForwarded: false`, sem a mensagem citada, sem legenda e, para áudio, com um anexo sem `fetchRef`. O comentário diz: "Ao agente, áudio ainda não é baixado (RN-09 da 005, S8 decide)".
- `baileys-provider.ts` (`toDirect`) não chama `announceMedia`. Ela só existe para os grupos.
- `ask-question.ts`:
  - com `isTextual(kind)` falso, responde "Por enquanto eu só entendo mensagens de texto";
  - todo texto da conta ativa passa por comandos da S5, "mostra a N", ajuda e busca.

  Um texto encaminhado vira pergunta e, quase sempre, "não encontrei".
- O contrato `canonical-message.schema.json` já tem `isForwarded` (obrigatório), `quotedExternalMessageId` e `text` livre para `image` e `document`. O `captureMethod` `forwarded_to_agent` também já existe. Ou seja, o esquema da S0 previu a S8.
- O canal de teste aceita só `senderAccountId` e `text` (`FakeAgentMessage`).

## 2. O que o WhatsApp manda num encaminhado

- A mensagem encaminhada chega com `contextInfo.isForwarded = true` e `forwardingScore`, no objeto do tipo (`extendedTextMessage`, `imageMessage`, `audioMessage` e outros). O texto puro pode chegar como `conversation` sem `contextInfo`. Nesse caso, ele não é distinguível de um texto digitado. 🟡 Confirmar na demonstração; testes cobrem os dois formatos.
- O autor original e a data original **não** vêm. É uma proteção de privacidade do WhatsApp. Por isso o autor do guardado é o dono (D-03).
- Encaminhar não deixa escrever junto do texto. Com "Adicionar mensagem", o comentário vai como mensagem separada, depois do encaminhado. Encaminhar várias mensagens de uma vez manda uma por uma, em sequência.
- Responder citando manda `contextInfo.stanzaId`, com o id da citada, e `quotedMessage`.
- A legenda de foto, vídeo e documento fica em `caption`. O documento com legenda pode vir embrulhado em `documentWithCaptionMessage`.

## 3. Alternativas avaliadas

| Tema | Alternativa | Por que não |
|------|-------------|-------------|
| Onde fica o que espera pedido | Tabela com TTL ou `agent_conversation_state` | O texto e a mídia de terceiros iriam para o disco (e para o WAL e os backups) mesmo sem o dono pedir. O requisito é "sem rastro" |
| Como guardar | Escrever direto em `messages` pelo `knowledge` | Duplicaria a ingestão: participante, proveniência, outbox de indexação e de mídia, reconciliação |
| Uma mensagem para vários temas | Reaproveitar a mensagem e criar vários itens | A citação na busca teria de escolher um tema, e "esquece a N" ficaria ambíguo |
| Autor | Pedir ao dono o nome de quem escreveu | Atrito a cada encaminhado; e o dono pode não saber |
| Tema automático | Classificar pelo sentido (S6) | Fora do escopo da v0.1 (`knowledge-indexing.md` NG-02) |
| Abrir o link | Buscar título e texto da página | Chamada de rede para fora a cada link; o resumo é da S9 |
| Paginação da listagem | "mais" | O "mais" já é da lista de grupos (S5); o "mostra a N" vai até 9 |
| Apagar o arquivo do áudio | Na hora, no processo do agente | Sem tentativa nova se o armazenamento cair; o objeto pode ser de outro item com o mesmo conteúdo |

## 4. Padrões reaproveitados

- Palavras fixas e ação pendente com confirmação: `agent/domain/command.ts` e `manage-sources.ts` (S5).
- Citações guardadas por 2 h e "mostra a N": `show-source.ts` (S7).
- Preparo de mídia antes da ingestão: `withMediaPreparation` em `src/main/media.ts` (S4).
- Fonte autorizada criada sob demanda: `ensure-import-source.ts` (S1).
- Exclusão em duas etapas com purga por prefixo: `request-deletion.ts` e `execute-deletion.ts` (S5).
- Métricas só com contagens e painéis por fatia: `otel-show-source-observer.ts` (S7).

## 5. Fontes

- `_reversa_sdd/sdd/knowledge-indexing.md`, `conversational-agent.md`, `channel-contract.md`
- `_reversa_sdd/addenda/003` a `008`
- Código: `src/channels/whatsapp/provider/{provider,mapping,baileys-provider}.ts`, `src/channels/whatsapp/whatsapp-channel.ts`, `src/modules/agent/application/ask-question.ts`, `src/modules/ingestion/application/ingest-message.ts`, `src/main/media.ts`, `src/main/compose.ts`, `migrations/0002`, `0003`, `0008`
- Baileys (rc): os tipos de `proto.IContextInfo` (`isForwarded`, `forwardingScore`, `stanzaId`, `quotedMessage`) em `node_modules/baileys/WAProto/index.d.ts` (conferidos em 2026-11-26)
