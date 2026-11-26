# Roadmap: Ver a mensagem original com contexto (fatia S7)

> Identificador: `008-mostrar-original-com-contexto`
> Data: `2026-11-25`
> Requirements: `_reversa_forward/008-mostrar-original-com-contexto/requirements.md`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA

## 1. Resumo da abordagem

A fatia não usa LLM nem cálculo de sentido: é leitura no banco a partir de ids que o agente já tem.
- **Citações guardadas:** toda resposta com citações grava, no estado curto da conversa (`agent_conversation_state`, da S5), a lista das citações, só com ids e a faixa do trecho de áudio, válida por 2 h.
- **Comando:** "mostra a N" é reconhecido por palavras fixas, como os comandos da S5.
- **Leitura:** um serviço novo do `agent` lê a mensagem citada e as vizinhas por uma porta nova do `retrieval`, a busca por contexto (RF-07 da spec), e monta a resposta de forma determinística.
- **Áudio:** a resposta neutra (`AgentReply`) ganha, de forma aditiva (contrato 1.4.0), um anexo de mídia por referência: o id do anexo, nunca os bytes. O adaptador busca os bytes por uma porta injetada pelo `src/main`, que confere o dono e decifra só na memória. O WhatsApp manda como mensagem de voz; o canal de teste registra o anexo.

## 2. Princípios aplicados

`.reversa/principles.md` não existe neste projeto. Valem os princípios de produto e engenharia do `CLAUDE.md` e do `requirements.md` do projeto.

| Princípio | Como a feature se relaciona | Status |
|-----------|------------------------------|--------|
| Evidence over hallucination | Mostra a fonte inteira da citação, sem gerar texto | respeita |
| WhatsApp-first, not WhatsApp-only | O núcleo só produz `AgentReply`; o anexo vai por referência e cada adaptador decide como entregar | respeita |
| Local First / Security First | Nada sai da máquina além do WhatsApp do próprio dono; o áudio é decifrado só na memória e só para a conta verificada dona do espaço | respeita |
| API First / Documentation First | Contrato 1.4.0 e interfaces escritos antes do código | respeita |
| TDD, testes de contrato, complexidade ≤ 10 | Suíte de contrato cobre o anexo nos dois adaptadores | respeita |

## 3. Decisões técnicas

| ID | Decisão | Justificativa | Alternativas descartadas | Confidência |
|----|---------|----------------|--------------------------|-------------|
| D-01 | O comando é reconhecido em `agent/domain/show-source.ts` por expressão fixa sobre o texto normalizado (`normalizeText` da S5): `^(?:mostra|mostrar|ver|original)(?: a)? ([1-9])$`. Ele entra em `answerActive` depois dos comandos de gestão e antes da ajuda | Mesma previsibilidade dos comandos da S5 (RN-02); "me mostra o que a Ana disse" não casa | Classificar a intenção com LLM (sem LLM na v0.1); juntar no `command.ts` de gestão (mistura responsabilidades) | 🟢 |
| D-02 | As citações ficam em duas colunas novas de `agent_conversation_state`: `citations jsonb` (índice, `messageId`, `kind`, `audioStartS`, `audioEndS`) e `citations_at`. Valem 2 h | Já é o estado curto por dono e canal da S5; nenhuma tabela nova; só ids (RN-08) | `AgentSession` completa da spec (10 trocas, fora do escopo); cache em memória (perde no reinício e não serve para dois processos) | 🟢 |
| D-03 | Só resposta `answered` grava a lista e substitui a anterior; "não encontrei", ajuda e comandos não mexem | RN-01; o cenário "não encontrei não troca" do requirements | Limpar a cada mensagem (perde a lista com uma pergunta sem resultado) | 🟢 |
| D-04 | Porta nova no `retrieval`: `SourceContext.around(spaceId, messageId, k)`, com implementação Postgres que usa o índice `messages_source_sent_at` e ordena por `(sent_at, created_at, id)`. Devolve a mensagem alvo (autor, conversa, estado da fonte, texto e, se for áudio, o anexo com a transcrição ativa e os segmentos) e até `k` mensagens antes e depois da mesma fonte e espaço | RF-07 da spec do `retrieval`; o empate de horário (o export só tem minuto) se resolve pela ordem de gravação, que é a do arquivo | Ler pelo `agent` direto no banco (fura o módulo); contexto por `quoted_message_id` (nem toda conversa usa resposta citada) | 🟢 |
| D-05 | `k = 3`. Fonte em `deleting`, ou mensagem que não existe mais, devolve `deleted` ou `not_found`, sem conteúdo | Esclarecimento de 2026-11-25; `retrieval` EC-05 | Mostrar mesmo em exclusão (fere a S5) | 🟢 |
| D-06 | A resposta é montada por um compositor determinístico novo, `composeOriginal`:<br>• cabeçalho com autor, conversa, data e hora;<br>• o texto inteiro da citada;<br>• as vizinhas com hora, autor e até 280 caracteres, e a citada marcada com "»".<br>Para áudio:<br>• a duração e a transcrição por segmentos com o tempo de cada um, e os segmentos citados marcados com "»";<br>• transcrição acima de 6.000 caracteres vira uma janela em volta do trecho citado, com "(…)";<br>• o arquivo completo vai em seguida | Texto neutro, sem formatação de canal (ADR-0004, RF-10); `AgentReply.text` tem limite de 20.000; o adaptador divide em partes de 4.000 | Formatação WhatsApp (negrito) no núcleo; transcrição sem limite (estoura o contrato com áudio de 60 min) | 🟡 |
| D-07 | Contrato do canal 1.4.0, aditivo: `AgentReply.media` opcional, com no máximo 1 item `{ kind: "audio", ref: <id do anexo>, mimeType, durationSeconds?, sizeBytes, failureText }`. O núcleo nunca põe bytes no `AgentReply` | Um JSON validado não carrega 1 MB de áudio; a referência mantém a resposta neutra e pequena. O `failureText` deixa o texto de falha com o núcleo | Bytes em base64 no `AgentReply`; uma URL temporária (o armazenamento é local e o link não abre no celular, requirements RN-06) | 🟢 |
| D-08 | Porta nova no contrato: `OutboundMediaLoader(destinationAccountId, ref) → MediaContent`, injetada pelo `src/main` em cada adaptador. A implementação (`media`) resolve a conta, confere que o anexo é do espaço dela e está `stored`, decifra com o `ObjectStore` da S4 e confere o SHA-256 | O adaptador não conhece armazenamento nem banco (regras de arquitetura); a checagem do dono fica no núcleo | O adaptador ler o SeaweedFS (fura `object-store-isolated`); o agente mandar bytes (D-07) | 🟢 |
| D-09 | `WhatsAppProvider.sendAudio(chatJid, bytes, mimeType, seconds)`: no Baileys, `sendMessage(jid, { audio, mimetype, ptt: true, seconds })`. Recusa JID de grupo, como `sendText`. O simulador registra | Mensagem de voz é como o áudio original chegou; só no `baileys-provider.ts` (regra `whatsapp-lib-isolated`) | Mandar como documento (abre fora do player do WhatsApp) | 🟡 |
| D-10 | No `sendReply`, o adaptador manda as partes do texto e depois o áudio, pelo mesmo `pacer` e com as mesmas tentativas. Se o loader ou o envio falharem, manda o `failureText` e conta `failed`. Acima de 16 MB, o núcleo nem anexa: o texto avisa | Ordem natural: ler, depois ouvir. 16 MB é o limite de áudio do WhatsApp | Mandar o áudio antes do texto; tentar indefinidamente | 🟡 |
| D-11 | Áudio sem arquivo guardado (`storage_status` diferente de `stored`), ou com a transcrição pendente ou falha, mostra o estado em texto e só anexa se o arquivo existir | RN-06 | Esconder a citação | 🟢 |
| D-12 | Métricas sem conteúdo:<br>• `agent_show_source_total{outcome}`, com `shown`, `no_recent`, `out_of_range`, `deleted` e `not_found`;<br>• `channel_media_sent_total{adapter,outcome}`, com `sent`, `failed` e `missing`.<br>Painéis em `gestao.json` e `whatsapp.json`. Span `agent.show_source` sem texto | RF-09; padrão das S4 a S6 | Log com o texto (fere a privacidade) | 🟢 |
| D-13 | A ajuda ganha "mostra a N", com exemplo | RF-08 | — | 🟢 |
| D-14 | A suíte de contrato do canal ganha os cenários de resposta com anexo (entregue, loader falhando e canal sem mídia) para o canal de teste e o WhatsApp simulado | RF-10; ADR-0004 | Testar só no WhatsApp | 🟢 |
| D-15 | E2E pelo canal de teste: pergunta, "mostra a 1" de texto, "mostra a 1" de áudio sintético (`test/support/audio.ts`) com o SHA-256 do anexo igual ao original, "mostra a 3" fora do intervalo e citações vencidas com relógio injetado | Critérios de aceite do requirements | Só testes unitários | 🟢 |

## 4. Premissas

Nenhuma `[DÚVIDA]` ficou aberta; as três foram resolvidas em 2026-11-25. Seguem as premissas técnicas que valem conferir na demonstração:

| Premissa | Origem (`requirements.md` seção) | Risco se errada |
|----------|----------------------------------|-----------------|
| O Baileys 7.0.0-rc14 manda Ogg/Opus como mensagem de voz (`ptt: true`) sem converter | RN-06; D-09 | O áudio chega como arquivo genérico ou não toca; plano B: mandar sem `ptt` |
| 6.000 caracteres de transcrição bastam para ler o contexto do trecho | RN-06; D-06 | Resposta longa demais no WhatsApp; ajustável por constante |

## 5. Delta arquitetural

A extração é greenfield. Os componentes vêm das specs e dos adendos.

| Componente | Arquivo de origem no legado | Tipo de mudança | Resumo |
|------------|------------------------------|-----------------|--------|
| `conversational-agent` | `_reversa_sdd/sdd/conversational-agent.md#6.1 Requisitos Principais` (RF-06, RF-09) | componente-novo | Comando "mostra a N", serviço `createShowSource`, compositor `composeOriginal` e citações no estado curto |
| `retrieval` | `_reversa_sdd/sdd/retrieval.md#6. Requisitos Funcionais` (RF-07) | componente-novo | Porta `SourceContext` e implementação Postgres |
| `media-transcription` | `_reversa_sdd/sdd/media-transcription.md#6. Requisitos Funcionais` (RF-09) | regra-alterada | A URL temporária vira o `OutboundMediaLoader`: leitura do arquivo cifrado só para o dono, para envio pelo canal |
| `channel-contract` | `_reversa_sdd/sdd/channel-contract.md#6. Requisitos Funcionais` | contrato-alterado | `AgentReply.media` e a porta `OutboundMediaLoader` (1.4.0, aditivo) |
| `whatsapp-baileys-adapter` | `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#6. Requisitos Funcionais` | regra-alterada | `sendAudio` no provedor e o envio do anexo no `sendReply` |
| Canal de teste | `_reversa_sdd/addenda/001-walking-skeleton.md` | regra-alterada | O `outbox` registra o anexo (ref, tipo, tamanho e SHA-256) |
| `platform-foundation` | `_reversa_sdd/sdd/platform-foundation.md#6. Requisitos Funcionais` | regra-alterada | Migração 0010, composição das portas novas, métricas e painéis |

## 6. Delta no modelo de dados

- Resumo das mudanças: duas colunas novas em `agent_conversation_state` (`citations`, `citations_at`), sem tabela nova nem índice novo. A busca por contexto usa o índice `messages_source_sent_at` da S3.
- Detalhe completo em: `_reversa_forward/008-mostrar-original-com-contexto/data-delta.md`

## 7. Delta de contratos externos

| Contrato | Tipo | Arquivo de detalhe |
|----------|------|--------------------|
| Contrato do canal 1.4.0 (`AgentReply.media`, `OutboundMediaLoader`) | interface TypeScript e JSON Schema | `interfaces/canal-anexo-de-audio.md` |
| Comando "mostra a N" e textos das respostas | mensagem do usuário ao agente | `interfaces/comando-mostrar.md` |
| `WhatsAppProvider.sendAudio` | porta interna do adaptador | `interfaces/canal-anexo-de-audio.md` §4 |
| OpenAPI do canal de teste | HTTP | `contracts/openapi.yaml` (só a referência ao schema, que ganha `media`) |

## 8. Plano de migração

1. Migração `0010_show_source.sql`, aditiva: duas colunas anuláveis. A volta atrás apaga as colunas.
2. Contrato 1.4.0: o schema ganha `media` opcional; `npm run contracts:generate`; `CONTRACT_VERSION = "1.4.0"`. Respostas sem `media` continuam válidas.
3. Ao subir, nenhuma lista existe ainda: "mostra a N" antes da primeira resposta cai em `no_recent`, como esperado.

## 9. Riscos e mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| O áudio de terceiros vai para o celular do dono | médio | certa (é o pedido) | Só a conta verificada dona do espaço recebe, só na conversa direta; o arquivo nunca é gravado decifrado. Nas conversas importadas, o export saiu do celular do dono, que já tinha o áudio. Nos grupos capturados, o dono autorizou a captura declarando o consentimento (ADR-0011). Em nenhum dos casos o áudio vai para alguém além do dono |
| Mandar mídia aumenta o risco de bloqueio do número do agente | médio | baixa | Só em resposta a pedido do dono, pelo mesmo `pacer` (1 msg/s) |
| O Baileys rc não mandar Ogg como voz | médio | baixa | Teste manual na demonstração; plano B sem `ptt` (premissa) |
| Mensagem vizinha com o mesmo minuto fora de ordem | baixo | média | Desempate pela ordem de gravação (`created_at`), que segue o arquivo exportado, e depois por `id` |
| Transcrição longa demais | baixo | média | Janela de 6.000 caracteres em volta do trecho; o arquivo completo vai junto |
| Citação de conversa apagada depois da resposta | médio | baixa | Leitura confere o estado da fonte (`deleted`) e o espaço |

## 10. Critério de pronto

- [ ] Todas as ações do `actions.md` marcadas `[X]`
- [ ] `cross-check.md` (se executado) sem CRITICAL nem HIGH
- [ ] `regression-watch.md` gerado
- [ ] Os 7 jobs da esteira verdes no PR
- [ ] Demonstração com o chip: pergunta, "mostra a N" de texto e de áudio (ouvido no celular) e um caso negativo
- [ ] Re-extração reversa executada e sem regressão vermelha (recomendado, não obrigatório)

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-25 | Versão inicial gerada por `/reversa-plan` | reversa |
