# Actions: Ver a mensagem original com contexto (fatia S7)

> Identificador: `008-mostrar-original-com-contexto`
> Data: `2026-11-25`
> Roadmap: `_reversa_forward/008-mostrar-original-com-contexto/roadmap.md`

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de ações | 17 |
| Paralelizáveis (`[//]`) | 13 |
| Maior cadeia de dependência | 6 (T002 → T007 → T010 → T011 → T015 → T017) |

**Prática:** TDD.
- A integração da busca por contexto, o E2E dos cenários de aceite e a suíte de contrato (Fase 2) vêm antes do núcleo. As demais ações escrevem o teste antes do código, no mesmo bloco.
- Os testes usam áudio sintético (`test/support/audio.ts`), o armazenamento de teste (`test/support/object-storage.ts`) e o WhatsApp simulado. Nenhum teste usa áudio real nem rede.

**Tamanho:** 17 ações, um pouco acima das ~15 da regra das fatias. Se for preciso dividir, sem renumerar:
- a **S7a** leva o texto (mensagem inteira, vizinhas e transcrição): T001, T003, T004 sem os cenários de arquivo, T006 a T011, T015 sem o loader, T016 e T017;
- a **S7b** leva o arquivo do áudio: T002, T005, T012 a T014 e os cenários de arquivo do T004.

## Fase 1, Preparação

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T001 | **Migração `0010_show_source.sql`** conforme o `data-delta.md` §1:<br>• `agent_conversation_state.citations jsonb`, com `CHECK` de array;<br>• `citations_at timestamptz`;<br>• `down` que apaga as duas colunas.<br>O teste de schema em `test/integration/` confere as colunas, o `CHECK` e o `down` | - | `[//]` | `migrations/0010_show_source.sql` | 🟢 | `[X]` |
| T002 | **Contrato do canal 1.4.0** (`interfaces/canal-anexo-de-audio.md` §1 e §2):<br>• `AgentReply.media` opcional no schema, com no máximo 1 item (`kind`, `ref`, `mimeType`, `durationSeconds?`, `sizeBytes` até 16 MB, `failureText`);<br>• `CONTRACT_VERSION = "1.4.0"`;<br>• tipo `OutboundMediaLoader` em `knowledge-channel.ts`;<br>• `npm run contracts:generate` e `contracts:check`.<br>Testes unitários do schema: sem `media` continua válido; 2 itens, bytes acima do limite ou `ref` fora de uuid são recusados | - | `[//]` | `contracts/channel/agent-reply.schema.json` | 🟢 | `[X]` |

## Fase 2, Testes

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T003 | **Integração da busca por contexto** (Postgres real, D-04 e D-05):<br>• alvo mais 3 antes e 3 depois, em ordem;<br>• desempate estável no mesmo minuto;<br>• primeira e última mensagem da conversa;<br>• outra fonte e outro espaço nunca entram;<br>• fonte `deleting` dá `deleted`; id inexistente dá `not_found`;<br>• áudio traz a duração, o estado do arquivo e a transcrição ativa com os segmentos | - | `[//]` | `test/integration/source-context.test.ts` | 🟢 | `[X]` |
| T004 | **E2E dos cenários de aceite** (`requirements.md#7`), pelo canal de teste e pelo WhatsApp simulado:<br>• "mostra a 2" de texto, com a mensagem inteira e a conversa em volta;<br>• "ver 1" de áudio sintético, com a transcrição marcada e o anexo com o SHA-256 do original;<br>• áudio sem arquivo guardado;<br>• "mostra a 3" fora do intervalo;<br>• citações vencidas, com relógio injetado;<br>• "não encontrei" não troca a lista;<br>• conversa apagada depois da resposta;<br>• "me mostra o que..." continua pergunta;<br>• a ajuda mostra o comando;<br>• logs sem texto, nomes nem telefones | T002 | `[//]` | `test/e2e/show-source.test.ts` | 🟢 | `[X]` |
| T005 | **Suíte de contrato do canal** (`interfaces/canal-anexo-de-audio.md` §5), nos dois adaptadores:<br>• resposta com `media` e loader ok entrega o texto e depois o anexo, com o mesmo SHA-256;<br>• loader que falha entrega o `failureText`;<br>• resposta sem `media` igual à 1.3.0 | T002 | `[//]` | `test/contract/channel-contract-suite.ts` | 🟢 | `[X]` |

## Fase 3, Núcleo

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T006 | **Reconhecimento do comando** (D-01, `interfaces/comando-mostrar.md` §1): `parseShowSource(text)` sobre `normalizeText`. Testes unitários com as variações que casam e as que não casam | - | `[//]` | `src/modules/agent/domain/show-source.ts` | 🟢 | `[X]` |
| T007 | **Compositor `composeOriginal`** (D-06, D-11, `interfaces/comando-mostrar.md` §3 a §5), com testes unitários:<br>• cabeçalho, texto inteiro e vizinhas com hora (data quando muda o dia) e corte de 280;<br>• áudio por segmentos com "»" nos que se sobrepõem à faixa citada;<br>• janela de 6.000 caracteres com "(…)";<br>• transcrição pendente ou falha;<br>• arquivo ausente ou acima de 16 MB;<br>• `media` com `failureText`;<br>• textos de `no_recent`, `out_of_range`, `deleted` e `not_found` | T002 | - | `src/modules/agent/domain/original.ts` | 🟡 | `[X]` |
| T008 | **Porta `SourceContext` e implementação Postgres** (D-04, D-05, `data-delta.md` §2), exportadas pelo `index.ts` do `retrieval`. Faz passar o T003 | T003 | `[//]` | `src/modules/retrieval/infrastructure/pg-source-context.ts` | 🟢 | `[X]` |
| T009 | **Citações no estado curto** (D-02, D-03):<br>• `ConversationStateStore` ganha `saveCitations` e `citations`, com o momento;<br>• na implementação Postgres, o upsert só toca as duas colunas.<br>Testes de integração: gravar não apaga a lista nem a ação pendente da S5; a validade é conferida pelo chamador | T001 | `[//]` | `src/modules/agent/application/conversation-state.ts` | 🟢 | `[X]` |
| T010 | **Serviço `createShowSource`** (`interfaces/comando-mostrar.md` §2), com observador de resultado e testes unitários com dublês:<br>• lista ausente ou acima de 2 h dá `no_recent`;<br>• N maior que a lista dá `out_of_range`;<br>• `deleted` e `not_found`;<br>• `shown` com a citação de mesmo índice | T006, T007, T008, T009 | - | `src/modules/agent/application/show-source.ts` | 🟢 | `[X]` |
| T011 | **Ligação no agente** (D-01, D-03, D-13):<br>• `answerActive` chama o "mostra a N" depois dos comandos de gestão e antes da ajuda;<br>• toda resposta `answered` grava as citações; "não encontrei" não grava;<br>• a ajuda (`help.ts`) ganha "Ver a mensagem original".<br>Testes unitários de `ask-question` | T010 | - | `src/modules/agent/application/ask-question.ts` | 🟢 | `[X]` |
| T012 | **`OutboundMediaLoader` no `media`** (D-08, `interfaces/canal-anexo-de-audio.md` §2):<br>• conta ativa, depois espaço, depois anexo `stored` do espaço;<br>• `ObjectStore.get` e conferência do SHA-256;<br>• `MediaUnavailableError` em `expired` e `download_failed`.<br>Testes de integração com o armazenamento de teste: anexo de outro espaço é recusado; o hash diverge, recusa | T002 | `[//]` | `src/modules/media/application/load-outbound-media.ts` | 🟢 | `[X]` |

## Fase 4, Integração

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T013 | **Canal de teste com anexo** (D-10, D-14):<br>• `sendReply` chama o loader injetado;<br>• o `outbox` registra `{ ref, kind, mimeType, sizeBytes, sha256, mediaOutcome }` e o `failureText` quando falha;<br>• a rota HTTP do `outbox` e o `contracts/openapi.yaml` refletem o campo.<br>Faz passar a suíte do T005 no canal de teste | T002, T005 | `[//]` | `src/channels/fake/fake-channel.ts` | 🟢 | `[X]` |
| T014 | **WhatsApp com anexo** (D-09, D-10, `interfaces/canal-anexo-de-audio.md` §3 e §4):<br>• `WhatsAppProvider.sendAudio`, com o Baileys `ptt: true` só em `baileys-provider.ts` e o simulador registrando o envio;<br>• recusa de grupo;<br>• `sendReply` manda o texto e depois o áudio, pelo `pacer` e com as mesmas tentativas;<br>• falha manda o `failureText`;<br>• métrica `channel_media_sent_total{adapter,outcome}`.<br>Faz passar a suíte do T005 no WhatsApp simulado | T002, T005 | `[//]` | `src/channels/whatsapp/whatsapp-channel.ts` | 🟡 | `[X]` |
| T015 | **Composição no `src/main`** (ADR-0001):<br>• `SourceContext`, o estado das citações e o `createShowSource` no agente da API e do processo do WhatsApp;<br>• o `OutboundMediaLoader` com o `ObjectStore` da S4 nos dois canais (sem mídia configurada, o loader não é injetado).<br>Faz passar o E2E do T004 | T011, T012, T013, T014 | - | `src/main/compose.ts` | 🟢 | `[X]` |

## Fase 5, Polimento

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T016 | **Observabilidade** (D-12):<br>• observador OTel com `agent_show_source_total{outcome}` e o span `agent.show_source` sem texto;<br>• painel em `gestao.json` (pedidos de original por resultado) e em `whatsapp.json` (áudios enviados por resultado) | T010, T014 | `[//]` | `infra/local/config/grafana/dashboards/gestao.json` | 🟢 | `[X]` |
| T017 | **Documentação**:<br>• `README.md` e a linha de comandos do `CLAUDE.md` e do `AGENTS.md` com "mostra a N";<br>• nota de execução nas interfaces;<br>• `onboarding.md` conferido contra o comportamento final | T015 | `[//]` | `README.md` | 🟢 | `[X]` |

## Notas de execução

- **T003 e T008 (ordem no mesmo minuto):** o desempate passou de `(sent_at, id)` para `(sent_at, created_at, id)`. A ordem de gravação segue a do arquivo exportado, e o `id` é aleatório. A posição da citada é lida no próprio SQL, porque o `Date` do JavaScript corta os microssegundos de `created_at`, e a citada voltava como vizinha dela mesma. O roadmap (D-04) e o `data-delta.md` §2 foram ajustados.
- **T004 (E2E):** roda pelo WhatsApp simulado, com importação real, SeaweedFS e o motor de transcrição falso. Dois cenários do requirements foram para os testes unitários:
  - citações vencidas, porque não dá para esperar 2 h (T010, com relógio injetado);
  - áudio sem arquivo guardado, porque ele nunca é transcrito e por isso não vira citação pela busca (T007).

  O canal de teste fica coberto pela suíte de contrato (T005).
- **T007 (compositor):**
  - o texto da citada é limitado a 12.000 caracteres, para caber nos 20.000 do `AgentReply.text`;
  - o aviso de arquivo grande diz "por aqui", sem nomear o canal.
- **T009:** as citações viraram uma porta própria (`CitationStore`), implementada pelo mesmo `createPgConversationState`. Os dublês da S5 não mudaram.
- **T011:** a ajuda tem limite de 600 caracteres desde a S2, então o comando entrou como uma linha só.
- **T014 (WhatsApp):**
  - a resposta a uma pergunta vai para o `chatJid`, que pode ser um LID, mas o loader confere a conta pelo telefone E.164 (`senderPhone`), por isso o adaptador passa os dois;
  - `mediaSent` é opcional no observador, para não quebrar os dublês.
- **T015:** sem chave de mídia ou sem S3 no `.env`, o `src/main` não injeta o loader e avisa na subida. O canal entrega o `failureText`.
- **T016:** o span `agent.show_source` não leva atributos; o resultado e o tipo ficam na métrica.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-25 | Versão inicial gerada por `/reversa-to-do` | reversa |
