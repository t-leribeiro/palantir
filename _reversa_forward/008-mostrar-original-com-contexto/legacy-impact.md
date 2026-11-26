# Legacy impact: Ver a mensagem original com contexto (fatia S7)

> Identificador: `008-mostrar-original-com-contexto`
> Data: `2026-11-25`
> Feature greenfield sobre as features 001 a 007, sem legado extraído de código. Âncora: `prd.md`, as specs SDD e os adendos `addenda/001-*` a `addenda/007-*` e `addenda/bug-*`.
> Política de edição no momento da execução: `allowLegacyEdits: true`, `allowedPaths: []` (projeto inteiro liberado).
> Execução: 17 de 17 ações.

## Arquivos afetados

| Arquivo afetado | Componente (spec) | Tipo | Severidade | Justificativa |
|-----------------|-------------------|------|------------|---------------|
| `migrations/0010_show_source.sql` (novo) | conversational-agent | delta-de-dados | MEDIUM | `agent_conversation_state.citations` (lista, com `CHECK`) e `citations_at` |
| `contracts/channel/agent-reply.schema.json`, `src/contracts/channel/knowledge-channel.ts`, `src/contracts/channel/generated.ts` | channel-contract | delta-de-contrato-externo | HIGH | Contrato 1.4.0, aditivo: `AgentReply.media` (anexo por referência, até 16 MB, com `failureText`) e a porta `OutboundMediaLoader` |
| `src/modules/agent/domain/show-source.ts`, `src/modules/agent/domain/original.ts` (novos) | conversational-agent | componente-novo | MEDIUM | Comando por palavras fixas e compositor determinístico da mensagem original, da conversa em volta e da transcrição marcada |
| `src/modules/agent/application/show-source.ts` (novo), `ask-question.ts`, `conversation-state.ts`, `domain/help.ts` | conversational-agent | regra-alterada | MEDIUM | "mostra a N" entre os comandos de gestão e a ajuda; resposta com citações grava a lista (2 h); porta `CitationStore`; linha nova na ajuda |
| `src/modules/agent/infrastructure/pg-conversation-state.ts`, `otel-show-source-observer.ts` (novo) | conversational-agent | regra-alterada | LOW | Upsert só das colunas das citações; métrica `agent_show_source_total` |
| `src/modules/retrieval/application/source-context.ts`, `infrastructure/pg-source-context.ts` (novos), `index.ts` | retrieval | componente-novo | MEDIUM | Busca por contexto (RF-07): a citada inteira, com o áudio e a transcrição, e até 3 vizinhas de cada lado na mesma conversa e no mesmo espaço |
| `src/modules/media/application/load-outbound-media.ts`, `infrastructure/pg-outbound-media.ts` (novos), `index.ts` | media-transcription | componente-novo | HIGH | Arquivo do áudio só para a conta ativa dona do espaço, decifrado na memória e conferido pelo SHA-256 |
| `src/channels/fake/fake-channel.ts`, `http-routes.ts`, `contracts/openapi.yaml` | channel-contract (canal de teste) | regra-alterada | LOW | O `outbox` registra o anexo só com tamanho e SHA-256; o `failureText` entra nas partes quando o anexo falha |
| `src/channels/whatsapp/provider/provider.ts`, `baileys-provider.ts`, `simulated-provider.ts` | whatsapp-baileys-adapter | regra-alterada | HIGH | `sendAudio` (mensagem de voz, `ptt`), que recusa grupo; o simulador registra o envio |
| `src/channels/whatsapp/whatsapp-channel.ts`, `observability.ts` | whatsapp-baileys-adapter | regra-alterada | HIGH | Texto e depois o áudio pelo `pacer`, com tentativas; falha manda o `failureText`; métrica `channel_media_sent_total`. O loader recebe o telefone do dono e o envio vai para o `chatJid` |
| `src/main/show-source.ts` (novo), `src/main/compose.ts` | platform-foundation | componente-novo | MEDIUM | Composição do serviço com span e métrica, e do loader por canal (sem mídia configurada, sem loader) |
| `infra/local/config/grafana/dashboards/gestao.json`, `whatsapp.json` | platform-foundation | regra-alterada | LOW | Painéis de pedidos de original e de áudios enviados por resultado |
| `test/**` (unit, integration, contract, e2e) | platform-foundation | componente-novo | LOW | TDD da fatia. A suíte de contrato aceita opções de construção (`loadMedia`); o teste de esquema da 0008 desfaz 3 migrações |
| `README.md`, `CLAUDE.md`, `AGENTS.md` | platform-foundation | regra-alterada | LOW | Como usar "mostra a N" e onde ficam as peças |

Arquivos pré-existentes modificados: os das features 001 a 007 listados acima. Nenhum arquivo anterior ao pipeline foi alterado.

## Diff conceitual por componente

- **conversational-agent:** antes, a resposta citava até 3 mensagens em trechos de 280 caracteres e esquecia as citações. Agora:
  - cada resposta com citações grava os ids e a faixa do trecho, por 2 h;
  - "mostra a N" (palavras fixas) devolve a mensagem N inteira, a conversa em volta e, para áudio, a transcrição marcada e o arquivo;
  - "não encontrei" não troca a lista.
- **retrieval:** ganhou a busca por contexto prevista na spec (RF-07). A ordem no mesmo minuto é a de gravação, que segue o arquivo exportado.
- **media-transcription:** a URL temporária da spec (RF-09) virou o `OutboundMediaLoader`. Ele só entrega o arquivo à conta dona do espaço, decifrado na memória.
- **channel-contract:** a 1.4.0 é aditiva, e respostas sem `media` continuam válidas. O anexo vai por referência; cada adaptador busca os bytes pelo loader injetado.
- **whatsapp-baileys-adapter:** passa a mandar mensagem de voz, só na conversa direta com o dono e só em resposta a um pedido dele.
- **platform-foundation:** migração 0010, composição, métricas e painéis.

## Preservadas

Feature greenfield: não há regras 🟢 extraídas de código para preservar.
- Os testes das features 001 a 007 continuam verdes.
- O texto da resposta de uma pergunta não mudou.
- Os comandos da S5 continuam com a mesma ordem e as mesmas palavras.
- Nenhum número escreve em grupos: `sendAudio` também recusa grupo.

## Modificadas

Feature greenfield: nenhuma regra 🟢 alterada ou removida. Regras 🟡 que evoluem:
- **RF-06 de `conversational-agent`** ("mostra a 2"): implementada. Em vez do link temporário, vem o texto inteiro, as vizinhas e o arquivo do áudio.
- **RF-09 de `conversational-agent`** (sessão com as citações da última resposta): implementada só a parte das citações, por 2 h. As 10 trocas não entraram.
- **RF-07 de `retrieval`** (busca por contexto): implementada com K = 3.
- **RF-09 de `media-transcription`** (URL temporária de 15 min): substituída pelo envio do arquivo pelo canal, só para o dono.
- **RN-08 da S3** (nenhum número escreve espontaneamente): continua valendo. O áudio só vai em resposta a um pedido do dono, na conversa direta.
