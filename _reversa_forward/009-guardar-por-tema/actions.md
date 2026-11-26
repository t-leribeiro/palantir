# Actions: Guardar um conteúdo com tema e recuperar pelo tema (fatia S8)

> Identificador: `009-guardar-por-tema`
> Data: `2026-11-26`
> Roadmap: `_reversa_forward/009-guardar-por-tema/roadmap.md`

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de ações | 23 |
| Paralelizáveis (`[//]`) | 16 |
| Maior cadeia de dependência | 6 (T006 → T012 → T013 → T014 → T021 → T022) |

**Prática:** TDD.
- A integração dos itens guardados, o E2E dos cenários de aceite e a suíte de contrato (Fase 2) vêm antes do núcleo. As demais ações escrevem o teste antes do código, no mesmo bloco.
- Os testes usam áudio sintético (`test/support/audio.ts`), o armazenamento de teste, o canal de teste e o WhatsApp simulado. Nenhum teste usa áudio real nem rede.
- Os textos das respostas são os de `interfaces/comandos-guardar.md`.

**Tamanho:** 23 ações, acima das ~15 da regra das fatias. Se for preciso dividir, sem renumerar:
- a **S8a** leva o texto: T001 a T013, T015 a T017, T019 a T023, sem os cenários de áudio, legenda e "esquece";
- a **S8b** leva o áudio, a legenda e o "esquece a N": T014, T018, a parte de áudio e legenda do T015 e do T016, e os cenários correspondentes do T003 ao T004.

## Fase 1, Preparação

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T001 | **Migração `0011_saved_items.sql`** conforme o `data-delta.md` §2:<br>• `sources.kind` com `saved` e uma por espaço;<br>• `themes`, `knowledge_items` e `evidence_references`;<br>• gatilhos de item sem evidência e de tema sem item;<br>• duas ações novas na auditoria;<br>• `down`.<br>Os nomes reais das restrições são conferidos no banco antes. Teste de esquema em `test/integration/saved-items-schema.test.ts`, conforme o `data-delta.md` §6. O teste de esquema da `0008` passa a desfazer 4 migrações | - | `[//]` | `migrations/0011_saved_items.sql` | 🟢 | `[X]` |
| T002 | **ADR-0014: guardar conteúdo encaminhado** (D-20):<br>• contexto: conteúdo de terceiros de conversas não acompanhadas;<br>• decisão: ato explícito do dono, uso pessoal, só local, sem rastro do que não foi pedido;<br>• consequências: a exclusão por item e por fonte, e o verificador externo nos termos do ADR-0013.<br>Entra no `docs/adr/README.md` | - | `[//]` | `docs/adr/0014-guardar-conteudo-encaminhado.md` | 🟡 | `[X]` |

## Fase 2, Testes

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T003 | **Integração dos itens guardados** (Postgres real, D-08 a D-10, D-13):<br>• guardar é idempotente;<br>• duplicata no tema por texto normalizado e por SHA-256, e o mesmo conteúdo em outro tema vira outro item;<br>• tema normalizado e reaproveitado com o nome da primeira vez;<br>• listagem do mais recente ao mais antigo, com limite 9 e contagem total;<br>• temas com contagem;<br>• esquecer apaga a mensagem, o item e o tema vazio, e diz se a chave do anexo ficou sem referência;<br>• outro espaço nunca aparece | T001 | `[//]` | `test/integration/saved-items.test.ts` | 🟢 | `[X]` |
| T004 | **E2E dos cenários de aceite** (`requirements.md#7`), pelo canal de teste e pelo WhatsApp simulado:<br>• encaminhado com aviso único e "guarda em X";<br>• resposta citando;<br>• os últimos 10 minutos;<br>• numa mensagem só;<br>• nada para guardar;<br>• áudio sintético guardado e achado pela palavra falada com o transcritor falso;<br>• foto sem legenda;<br>• listagem e "mostra a 1";<br>• tema com outra grafia;<br>• duplicata;<br>• guardado na resposta normal ("Guardados · tema");<br>• "esquece a N" com "confirmo";<br>• sem tema e vencimento, com relógio injetado;<br>• "como guardar senhas?" continua pergunta;<br>• conta pendente;<br>• logs sem texto, tema nem telefone | T001 | `[//]` | `test/e2e/save-by-theme.test.ts` | 🟢 | `[X]` |
| T005 | **Suíte de contrato do canal** (`interfaces/canal-encaminhado.md` §1), nos dois adaptadores:<br>• mensagem encaminhada chega com `isForwarded: true`;<br>• resposta citando traz `quotedExternalMessageId`;<br>• foto com legenda traz o `text`;<br>• áudio direto traz o anexo com `fetchRef` e é baixável;<br>• mensagem sem os campos novos continua igual | - | `[//]` | `test/contract/channel-contract-suite.ts` | 🟢 | `[X]` |

## Fase 3, Núcleo

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T006 | **Parsers do guardar, listar e esquecer** (D-06, `comandos-guardar.md` §2, §4 e §5), sobre o texto cru:<br>• `parseSave`: tema até 60, conteúdo depois do primeiro `:`, "guarda isso" sem tema;<br>• `parseSavedListing`: tema ou lista de temas;<br>• `parseForget`: N de 1 a 9.<br>Testes unitários com as variações e os casos que continuam pergunta ("como guardar senhas?", "guardei a senha onde?") | - | `[//]` | `src/modules/agent/domain/save-command.ts` | 🟢 | `[X]` |
| T007 | **Respostas do guardar, listar e esquecer** (`comandos-guardar.md` §2, §4, §5): textos fixos e `composeThemeListing`, que devolve um `AgentReply` `answered` com uma citação por item (autor "Você", `Guardados · <tema>`, data, 280 caracteres, áudio com duração e "transcrição pendente"), mais "Mostrando os 9 mais recentes de N". Testes unitários | - | `[//]` | `src/modules/agent/domain/saved-replies.ts` | 🟢 | `[X]` |
| T008 | **Ajuda reescrita** (D-19): inclui "guarda em <tema>" e "guardados <tema>", sem "só entendo texto", até 600 caracteres. `TEXT_ONLY_TEXT` e `textOnlyReply` saem do índice público se ficarem sem uso. O teste de tamanho continua | - | `[//]` | `src/modules/agent/domain/help.ts` | 🟡 | `[X]` |
| T009 | **Itens guardados no `knowledge`** (D-09, D-10):<br>• `domain/theme.ts`: normalização igual a `normalizeText`, limite de 60 e "sem tema" reservado;<br>• `application/saved-items.ts`: porta `SavedItemStore` e serviços `saveItem` (com a duplicata), `listTheme`, `listThemes` e `forgetItem`.<br>Testes unitários com dublê. Exportar pelo `index.ts` | - | `[//]` | `src/modules/knowledge/application/saved-items.ts` | 🟢 | `[X]` |
| T010 | **`createPgSavedItems`** sobre o `data-delta.md` §4 e §5:<br>• `insertItem` com o tema (upsert por `normalized`);<br>• consulta de duplicata;<br>• listagem com o primeiro trecho e o anexo;<br>• temas;<br>• `forget`, que apaga a mensagem só se for da fonte Guardados do espaço e devolve a chave do anexo sem referência.<br>Faz o T003 passar | T001, T009 | - | `src/modules/knowledge/infrastructure/pg-saved-items.ts` | 🟢 | `[X]` |
| T011 | **Espera na memória** (D-05, D-14):<br>• porta `PendingForwards` em `agent/application/pending-forwards.ts`;<br>• implementação `createMemoryPendingForwards`, com `add` (diz se abriu uma leva), `takeAll`, `take(externalId)`, `markAwaitingTheme`, `awaitingTheme` e `takeUntitledNotice`;<br>• até 20 por dono e canal, 10 min por mensagem;<br>• varredura de 30 s com `unref`, que guarda em "sem tema" pelo callback ou descarta, contando só os números.<br>Testes unitários com relógio injetado | - | `[//]` | `src/modules/agent/infrastructure/memory-pending-forwards.ts` | 🟡 | `[X]` |
| T012 | **Guardar no agente** (`agent/application/save-content.ts`, D-07, RN-11):<br>• porta `SaveContent` (o que guardar, o tema, a conta e o canal), que devolve os resultados por item;<br>• ligação pela citação, pelos últimos 10 minutos ou pela mensagem só;<br>• tipos: texto, link, áudio, legenda, sem legenda e não aceito;<br>• limite de 20;<br>• pedido de tema.<br>Monta a resposta pelo T007. Testes unitários com dublês | T006, T007, T011 | - | `src/modules/agent/application/save-content.ts` | 🟡 | `[X]` |
| T013 | **Roteamento da mensagem** (D-04, `comandos-guardar.md` §1), em `agent/application/route-message.ts`:<br>• encaminhado ou mídia vai para a espera, com o aviso da leva;<br>• o texto segue a ordem resposta de tema, guardar, S5, listar e esquecer, "mostra a N", ajuda e busca;<br>• o aviso de "sem tema" vem antes da próxima resposta.<br>`createAskQuestion` passa a usar o roteamento depois da identidade, e o "só texto" sai para conta ativa. Os testes existentes de `ask-question` continuam verdes | T012 | - | `src/modules/agent/application/route-message.ts` | 🟢 | `[X]` |
| T014 | **Listar e esquecer no agente** (`agent/application/saved-listing.ts`, D-12, D-13):<br>• listagem do tema e dos temas pelo `knowledge`, gravando as citações da S7;<br>• "esquece a N" confere que a citação é um guardado e grava a ação pendente `forget` (a união `PendingAction` ganha `forget`);<br>• `confirmo` apaga pelo `forgetItem`.<br>Testes unitários | T009, T013 | - | `src/modules/agent/application/saved-listing.ts` | 🟡 | `[X]` |

## Fase 4, Integração

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T015 | **Provedor WhatsApp** (D-02, `canal-encaminhado.md` §2):<br>• em `mapping.ts`, `contextOf` (`isForwarded` e `stanzaId`) e `captionOf`, inclusive `documentWithCaptionMessage`;<br>• `IncomingDirect` com `isForwarded`, `quotedId`, `caption` e `media`;<br>• `toDirect` anuncia o áudio pelo `announceMedia`;<br>• `simulated-provider.ts` aceita os campos e serve o áudio.<br>Testes unitários de mapeamento com mensagens Baileys de exemplo: texto puro, `extendedTextMessage` encaminhado, áudio, foto e documento com legenda | - | `[//]` | `src/channels/whatsapp/provider/mapping.ts` | 🟡 | `[X]` |
| T016 | **Canal WhatsApp** (`toCanonical`): copia `isForwarded`, `quotedExternalMessageId`, a legenda como `text` e o anexo de áudio com `fetchRef`, tamanho e duração. Testes do canal com o simulador | T015 | - | `src/channels/whatsapp/whatsapp-channel.ts` | 🟡 | `[X]` |
| T017 | **Canal de teste** (D-16, `canal-encaminhado.md` §3):<br>• `FakeAgentMessage` com `messageId`, `kind`, `isForwarded`, `quotedMessageId`, `caption` e `audioBase64`, servido pelo `fetchMedia`;<br>• rota HTTP;<br>• `contracts/openapi.yaml`.<br>Sem os campos novos, o comportamento é o de hoje. Testes do fake e das rotas | - | `[//]` | `src/channels/fake/fake-channel.ts` | 🟢 | `[X]` |
| T018 | **Purga de um objeto** (D-13): job `media.purge_object` (`{ key }`) no módulo `media`, com publicação pelo outbox numa porta usada pelo `forget` e worker que chama `deletePrefix(key)`. A operação é idempotente, com as tentativas do pg-boss. Testes com o armazenamento de teste | T001 | `[//]` | `src/modules/media/application/purge-object.ts` | 🟡 | `[X]` |
| T019 | **Citação e contexto do guardado** (D-11):<br>• `pg-search-index.ts` e `pg-source-context.ts` mostram `Guardados · <tema>` para fonte `saved`, e o contexto devolve o tipo da fonte;<br>• `composeOriginal` não mostra "Conversa em volta" para guardado e usa o cabeçalho "Guardado em <tema> em <data>".<br>Testes de integração da busca e unitários do compositor | T001 | `[//]` | `src/modules/retrieval/infrastructure/pg-search-index.ts` | 🟢 | `[X]` |
| T020 | **Fonte Guardados** (D-08, D-15):<br>• `sources/application/ensure-saved-source.ts`: conta do canal do dono, autorizada, `palantir:guardados`, uma por espaço;<br>• a lista "grupos" da S5 mostra "Guardados (N itens)";<br>• "acompanhar" e "parar" recusam;<br>• "apagar Guardados" segue a S5.<br>Testes unitários e de integração | T001 | `[//]` | `src/modules/sources/application/ensure-saved-source.ts` | 🟡 | `[X]` |
| T021 | **Composição do guardar** (`src/main/save-content.ts`, D-08):<br>• `SaveContent` em ordem: fonte Guardados, preparo do áudio com o `fetchMedia` do canal, duplicata, ingestão e item, com auditoria `knowledge.item_saved`;<br>• o `forget`, com auditoria `knowledge.item_forgotten` e a purga.<br>No `compose.ts`, para o canal de teste e para o WhatsApp:<br>• a espera em memória com a varredura;<br>• o roteamento e a listagem.<br>Sem mídia configurada, o áudio responde `media_off`. Faz o T004 passar | T010, T013, T014, T016, T017, T018, T019, T020 | - | `src/main/save-content.ts` | 🟡 | `[X]` |

## Fase 5, Polimento

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T022 | **Observabilidade** (D-18):<br>• observador OTel com `agent_save_total{outcome, kind}`, `agent_saved_listing_total{outcome}` e `agent_forwarded_total{outcome}`;<br>• span `agent.save` sem atributos de conteúdo;<br>• painel "Gestão".<br>Teste unitário de que nenhum rótulo leva tema nem texto | T021 | - | `src/modules/agent/infrastructure/otel-save-observer.ts` | 🟢 | `[X]` |
| T023 | **Documentação curta:**<br>• parágrafo da S8 no `README.md`;<br>• linha de estado e "Guardar (S8)" no `CLAUDE.md` e no `AGENTS.md`;<br>• S8 "🔄 em andamento" no `docs/plano-de-fatias.md`, com a linha no registro | - | `[//]` | `README.md` | 🟢 | `[X]` |

## Notas de execução

- **T001:** além do `data-delta.md` §2, `audit_events.target_kind` ganhou `knowledge_item`. Os testes de esquema da 0008 e da 0010 passaram a desfazer uma migração a mais.
- **T003, T009 e T010:** escritos juntos, para fixar a API do `knowledge` que os outros testes usam.
- **T008:** a ajuda ficou com 506 caracteres. `TEXT_ONLY_TEXT` continua: o canal composto sem as portas da 009 mantém o "só texto".
- **T011:** a memória tem um teto de 100 por dono e canal; o pedido leva as 20 primeiras. O prazo do "sem tema" conta a partir do "guarda isso", não da chegada do encaminhado.
- **T012:** a figurinha chega igual a uma foto sem legenda (`image` sem texto). As duas recebem a mesma resposta: "Dessa mensagem eu só guardaria a legenda, e ela não tem." O texto do `interfaces/comandos-guardar.md` §2 previa nomear o tipo.
- **T013:** a ordem do texto virou uma lista de passos em `answerActive`. Um "confirmo" sem nada pendente segue como pergunta, como já era na S5.
- **T014:** o "confirmo" da S5 devolve `null` para um esquecer pendente, e o serviço dos guardados confirma. O esquecer vencido tem resposta própria.
- **T015:** um texto puro (`conversation`) não traz `contextInfo` e chega como não encaminhado. Isso é a premissa do roadmap §4, a conferir na demonstração.
- **T017:** o canal de teste aceita texto de até 50.000 caracteres, e o id externo da mensagem ao agente passa a ser sempre gerado.
- **T019:** a expressão do título (`SOURCE_TITLE`) fica em `pg-search-index.ts` e é reaproveitada pelo `pg-source-context.ts`.
- **T020:**
  - "acompanhar" e "parar" sobre Guardados usam as respostas padrão da S5 ("não é um grupo", "não está sendo acompanhado"), sem texto próprio;
  - na lista "grupos", Guardados aparece por último como "seus itens guardados", sem a contagem prevista no D-15.
- **T021:**
  - o id externo da mensagem guardada leva o tema, para o mesmo encaminhado poder ir para dois temas: sem isso, a ingestão o veria como duplicata;
  - a gravação devolve o nome do tema da primeira vez. O E2E achou a resposta usando o nome digitado ("já estava guardado em arquitetura" em vez de "Arquitetura");
  - a purga do arquivo esquecido é publicada pelo gancho `onOrphanKeys`, na mesma transação do esquecer.
- **T004:**
  - 14 cenários pelo WhatsApp simulado e pelo canal de teste;
  - o vencimento dos 10 minutos e o "sem tema" ficam nos testes unitários, com relógio injetado;
  - a conta pendente fica coberta pelo roteamento do agente, que manda o código antes de qualquer guardar.
- **Gates locais:**
  - passaram tipos, lint, arquitetura (210 módulos), contratos e complexidade;
  - `npm test`: 729 passaram e um falhou por prazo sob carga (`real-exports.test.ts`, que passa sozinho);
  - integração: 15 arquivos tocados, todos verdes;
  - E2E da S8 e os da S0, S2, S5 e S7, todos verdes.
- **Desempenho da S1:** o teste de 10.000 mensagens em até 2 minutos levou cerca de 155 s nesta máquina, mesmo rodando sozinho. O motor de sentido ocupava 4,7 GB de memória. A S8 não toca o caminho da importação, e a CI confere.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-26 | Versão inicial gerada por `/reversa-to-do` | reversa |
