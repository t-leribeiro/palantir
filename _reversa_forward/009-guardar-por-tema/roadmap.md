# Roadmap: Guardar um conteúdo com tema e recuperar pelo tema (fatia S8)

> Identificador: `009-guardar-por-tema`
> Data: `2026-11-26`
> Requirements: `_reversa_forward/009-guardar-por-tema/requirements.md`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA

## 1. Resumo da abordagem

A S8 cabe no caminho que já existe, sem LLM, sem serviço novo e sem mudar a versão do contrato do canal. Ela tem quatro partes:
- **Adaptador WhatsApp:** passa a preencher no `CanonicalMessage` campos que o contrato já tem e que hoje vão vazios:
  - `isForwarded`;
  - `quotedExternalMessageId`;
  - a legenda de foto, vídeo e documento;
  - o anexo do áudio mandado ao agente, com a referência para baixar.
- **Núcleo do agente:** deixa de tratar como pergunta tudo o que chega.
  - O que foi encaminhado, e a mídia mandada direto, fica **esperando na memória do processo** por até 10 minutos.
  - "guarda em X" leva esse conteúdo para a fonte **Guardados** do espaço, pela mesma ingestão de qualquer mensagem. Assim o conteúdo fica pesquisável e entra nas respostas.
  - O áudio passa pelo preparo da S4 e é guardado cifrado e transcrito.
- **Módulo `knowledge`:** ganha os itens guardados, os temas e as referências de evidência da spec. Também ganha a listagem por tema.
- **Comandos novos:** "guardados <tema>", "o que guardei sobre <tema>", "temas" e "esquece a N" seguem as palavras fixas da S5. "mostra a N" da S7 funciona sobre a listagem.

## 2. Princípios aplicados

`.reversa/principles.md` não existe. Valem os princípios do `CLAUDE.md` e os requisitos de engenharia.

| Princípio | Como a feature se relaciona | Status |
|-----------|------------------------------|--------|
| WhatsApp-first, not WhatsApp-only | O núcleo recebe o `CanonicalMessage` neutro; o canal de teste ganha os mesmos campos; nada do Baileys sai de `baileys-provider.ts` e `mapping.ts` | respeita |
| Knowledge-first | O guardado vira `KnowledgeItem` com evidência, como a spec prevê, e não uma lista de favoritos | respeita |
| Evidence over hallucination | Todo item aponta para a mensagem guardada; o autor é o dono ("Você"), nunca um autor original inventado (RN-06) | respeita |
| Capture once, remember forever | O guardado é evidência imutável; sai só por "esquece a N" ou ao apagar os Guardados | respeita |
| Security First / Local First | O conteúdo fica na máquina; o que espera pedido fica só na memória e some em 10 min; nada vai para log | respeita |
| Complexidade ≤ 10 e arquitetura verificada | `ask-question.ts` já está perto do limite; o roteamento novo vai para uma função própria (D-04) | respeita, com atenção |

## 3. Decisões técnicas

| ID | Decisão | Justificativa | Alternativas descartadas | Confidência |
|----|---------|----------------|--------------------------|-------------|
| D-01 | O contrato do canal **não muda de versão** (fica 1.4.0). `isForwarded`, `quotedExternalMessageId` e `text` em `image`/`document` já existem no `canonical-message.schema.json`. O adaptador WhatsApp passa a preenchê-los nas mensagens diretas | O esquema já prevê os campos desde a S0 (`channel-contract.md` RF-09) | Versão 1.5.0 com campo novo de legenda (desnecessário: `text` já serve) | 🟢 |
| D-02 | No `baileys-provider.ts` e no `mapping.ts`, a mensagem direta ganha:<br>• `isForwarded`, de `contextInfo.isForwarded`;<br>• `quotedId`, de `contextInfo.stanzaId`;<br>• `caption`, de `imageMessage`, `videoMessage`, `documentMessage` e `documentWithCaptionMessage`;<br>• `media`, pelo mesmo `announceMedia` da captura de grupos, só para áudio. Hoje a mensagem direta não anuncia mídia | Mesmo mecanismo da S4: o `recentMedia` guarda a mensagem por 15 min, acima da janela de 10 min | Baixar o áudio ao receber (baixaria conteúdo que talvez nunca seja guardado) | 🟡 |
| D-03 | O WhatsApp não informa o autor original de um encaminhado. A mensagem guardada tem como autor o dono (`displayName` "Você") e como data o momento em que ele encaminhou | Comportamento de privacidade do WhatsApp (o encaminhado traz só `isForwarded` e `forwardingScore`) | Pedir o autor ao dono (atrito); inferir pelo texto (alucinação) | 🟢 |
| D-04 | Roteamento novo em `agent/application/route-message.ts`, chamado por `createAskQuestion` depois da identidade:<br>• encaminhado ou mídia (exceto pergunta) vai para a espera (D-05);<br>• texto de conta ativa segue a ordem: verificação, **guardar**, comandos da S5, **listagens e "esquece"**, "mostra a N", ajuda e busca.<br>O "só texto" (`textOnlyReply`) deixa de existir para conta ativa | Mantém `ask-question.ts` abaixo da complexidade 10 e deixa a ordem explícita | Ramificar dentro de `answerActive` | 🟢 |
| D-05 | **A espera fica na memória do processo** (`agent/infrastructure/memory-pending-forwards.ts`), atrás da porta `PendingForwards` em `agent/application/`:<br>• por dono e canal, até 20 mensagens, em ordem de chegada;<br>• 10 min a partir de cada mensagem;<br>• varredura a cada 30 s com `unref`;<br>• descarte sem log do conteúdo, só a contagem.<br>A "leva" é aberta quando chega o primeiro encaminhado com a espera vazia; só ele recebe o aviso | "Sem rastro" (RN-02): nada do que o dono não pediu vai para o disco | Tabela com TTL (o conteúdo iria para o banco e para o WAL); `agent_conversation_state` (idem) | 🟡 |
| D-06 | Parser `agent/domain/save-command.ts`, com palavras fixas sobre o texto **cru**, porque os dois-pontos e a URL importam:<br>• `^(guarda|guardar)( isso)?( em)? <tema>(: <conteúdo>)?$`, tema até 60 caracteres;<br>• o primeiro `:` separa tema e conteúdo.<br>Só "guarda isso" ou "guardar" pede o tema. "como guardar senhas?" não casa, porque precisa começar por guarda ou guardar | Mesmo padrão de `command.ts` e `show-source.ts` | Regex sobre o `normalizeText` (perde o `:` e a URL) | 🟢 |
| D-07 | Ligação do pedido ao conteúdo (RN-01):<br>• com `quotedExternalMessageId`, só a citada, se ainda estiver esperando. Se não estiver, o agente responde "não achei esse encaminhado, encaminhe de novo";<br>• sem citação, tudo o que espera;<br>• com conteúdo depois de `:`, só ele, e a espera fica como está | Escolha do dono em 2026-11-26 | — | 🟢 |
| D-08 | Serviço `SaveContent`, porta do agente implementada em `src/main/save-content.ts`. Por mensagem:<br>(1) garante a fonte Guardados do espaço: `kind = 'saved'`, autorizada, `external_conversation_id = 'palantir:guardados'`, na conta do canal do dono, uma por espaço;<br>(2) se for áudio, prepara pelo `media.prepare` da S4 com o `fetchMedia` do canal de origem;<br>(3) confere a duplicata no tema (D-10);<br>(4) ingere pelo `createIngestMessage`, com `captureMethod: forwarded_to_agent`, a conversa `palantir:guardados` e o id externo da própria mensagem;<br>(5) cria o item e a evidência no `knowledge`.<br>Os passos 4 e 5 são idempotentes: repetir acha a mensagem como `duplicate` e cria o item que faltou | Reaproveita ingestão, outbox, indexação, preparo e transcrição; o guardado fica pesquisável sem caminho paralelo | Inserir direto na tabela `messages` pelo `knowledge` (duplicaria a ingestão) | 🟡 |
| D-09 | Módulo `knowledge` ganha `application/saved-items.ts` (porta `SavedItemStore` e serviços `saveItem`, `listTheme`, `listThemes`, `forgetItem`) e `infrastructure/pg-saved-items.ts`. Tema normalizado pela mesma regra de `normalizeText` (RN-03), "sem tema" reservado | `knowledge-indexing.md` RF-05 a RF-07 e §9 | Pôr no `agent` (o item é conhecimento, não estado da conversa) | 🟢 |
| D-10 | Duplicata no tema (RN-07):<br>• texto pelo `normalizeForMatch` da ingestão;<br>• áudio pelo SHA-256 do arquivo preparado;<br>• legenda pelo texto.<br>Uma consulta sobre os itens do tema. O mesmo conteúdo em outro tema vira outra mensagem e outro item | Uma mensagem por item deixa "esquece a N" e a citação "Guardados · tema" sem ambiguidade | Uma mensagem com vários itens (a citação teria vários temas) | 🟡 |
| D-11 | Citação do guardado: `pg-search-index.ts` e `pg-source-context.ts` mostram, para fonte `saved`, o título `Guardados · <nome do tema>` pelo item ligado à mensagem. Autor "Você". O "mostra a N" de um guardado não mostra "Conversa em volta": as vizinhas na fonte Guardados não têm relação entre si | RN-08; a S7 assumia uma conversa real | Título fixo "Guardados" (perde o tema) | 🟢 |
| D-12 | Listagens (RN-09):<br>• "guardados <tema>" e "o que guardei sobre/em <tema>" mostram até **9** itens, do mais recente ao mais antigo, com "mostrando 9 de N" quando houver mais;<br>• "temas" e "guardados", sozinhos, listam os temas com a contagem, até 20.<br>A resposta usa `outcome: "answered"` com citações, autor "Você" e título "Guardados · tema", e a S7 grava as citações para o "mostra a N" | O "mostra a N" da S7 aceita de 1 a 9 | Paginação com "mais" (o "mais" é da lista de grupos da S5) | 🟢 |
| D-13 | "esquece a N" (RF-09):<br>• vale só se a citação N da última resposta é de um guardado;<br>• pede "confirmo" (ação pendente `forget` da S5, 5 min);<br>• a confirmação apaga a mensagem numa transação, e a cascata leva trechos, vetores, anexo e evidência. Gatilhos apagam o item sem evidência e o tema sem item;<br>• se o arquivo cifrado não tiver outra referência, publica `media.purge_object` pelo outbox, e o worker apaga a chave.<br>A auditoria registra `knowledge.item_forgotten`, sem conteúdo nem tema | Mesma confirmação dos atos destrutivos da S5; o objeto é endereçado pelo conteúdo e pode ser compartilhado | Apagar o objeto no processo do agente (sem tentativa nova se o armazenamento cair) | 🟡 |
| D-14 | "guarda isso" sem tema (RN-04): a espera marca o conteúdo como "aguardando tema".<br>• A próxima mensagem de texto do dono, com até 60 caracteres e que não seja comando, é o tema.<br>• Na varredura, o que esperava tema há 10 min é guardado em "sem tema", e um aviso fica pendente na memória para a próxima resposta.<br>Se o processo reiniciar nesse meio, o conteúdo se perde, como toda a espera | EC-03 da spec | Notificação espontânea pela fila `agent.notify` (o agente falaria sem pedido) | 🟡 |
| D-15 | A fonte Guardados aparece na lista "grupos" da S5 como "Guardados (N itens)":<br>• "apagar Guardados" usa a exclusão em duas etapas da S5 (cascata, purga por prefixo, aviso);<br>• "acompanhar" e "parar" respondem que Guardados não é um grupo.<br>O filtro por nome de conversa (RN-11 da S5) funciona com "guardados" na pergunta | RN-10; sem caminho de exclusão novo | Esconder a fonte (o dono não teria como apagar tudo de uma vez) | 🟡 |
| D-16 | O canal de teste (`fake-channel.ts`, `http-routes.ts`, `contracts/openapi.yaml`) ganha campos opcionais em `FakeAgentMessage`: `messageId`, `isForwarded`, `quotedMessageId`, `kind`, `caption` e `audio` (bytes em base64, servidos pelo `fetchMedia` do fake). A mudança é aditiva | RF-12: os mesmos cenários nos dois adaptadores | — | 🟢 |
| D-17 | Auditoria: `knowledge.item_saved` e `knowledge.item_forgotten` entram no `CHECK` de `audit_events.action`, com o id do item como alvo e sem tema nem conteúdo | `knowledge-indexing.md` §12; `addenda/006` | — | 🟢 |
| D-18 | Métricas, só com contagens:<br>• `agent_save_total{outcome, kind}`, com `saved`, `duplicate`, `asked_theme`, `nothing_pending`, `not_found`, `no_caption`, `unsupported`, `media_off` e `failed`;<br>• `agent_saved_listing_total{outcome}`, com `listed`, `empty` e `themes`;<br>• `agent_forwarded_total{outcome}`, com `noticed`, `queued`, `saved`, `untitled` e `discarded`.<br>Painel "Gestão". Span `agent.save`, sem atributos de conteúdo | RN-12; padrão da S7 | Tema como rótulo (proibido: é conteúdo) | 🟢 |
| D-19 | A ajuda passa de 591 caracteres para um texto reescrito, ainda com até 600 caracteres, que inclui "guarda em <tema>" e "guardados <tema>". "Por enquanto eu só entendo mensagens de texto" sai | RF-10; o teste de 600 caracteres continua | Subir o limite (decisão da S2) | 🟡 |
| D-20 | ADR-0014 curto: guardar conteúdo encaminhado. O conteúdo pode ser de terceiros de conversas não acompanhadas. A base é o ato explícito do dono, para uso pessoal, só local. Um verificador externo ligado o recebe como qualquer candidata, nos termos do ADR-0013 | O ADR-0011 cobre só a captura de grupos com consentimento | Sem ADR (a regra do projeto pede decisão escrita para dados de terceiros) | 🟡 |

## 4. Premissas

Nenhuma premissa vinda de `[DÚVIDA]`: as três dúvidas foram resolvidas na sessão de 2026-11-26. Ficam premissas técnicas, a confirmar na demonstração com o chip:

| Premissa | Origem | Risco se errada |
|----------|--------|-----------------|
| A versão rc do Baileys entrega `contextInfo.isForwarded` e `contextInfo.stanzaId` nas mensagens diretas, inclusive nas de mídia | D-02 | Sem `isForwarded`, o encaminhado viraria pergunta; mitigação: todo texto que chega logo antes de "guarda em X" também poderia entrar, o que exigiria nova decisão |
| O áudio encaminhado baixa pelo `downloadMediaMessage` do mesmo jeito que o de grupo | D-02, D-08 | O áudio não seria guardado; o agente responderia `failed` e a demonstração mostraria |

## 5. Delta arquitetural

| Componente | Arquivo de origem no legado | Tipo de mudança | Resumo |
|------------|------------------------------|-----------------|--------|
| conversational-agent | `_reversa_sdd/sdd/conversational-agent.md` | regra-alterada | Roteamento por tipo de mensagem, espera na memória, comandos de guardar, listar e esquecer; fim do "só texto" |
| knowledge-indexing | `_reversa_sdd/sdd/knowledge-indexing.md` | componente-novo | `KnowledgeItem`, `EvidenceReference` e `Theme`; serviços de guardar, listar e esquecer |
| retrieval | `_reversa_sdd/sdd/retrieval.md` | regra-alterada | Título "Guardados · tema" na citação; contexto sem vizinhas para guardados |
| identity-and-sources | `_reversa_sdd/sdd/identity-and-sources.md` | regra-alterada | Fonte `saved` por espaço; aparece na lista da S5 e é apagada pela exclusão da S5 |
| ingestion | `_reversa_sdd/sdd/ingestion.md` | regra-alterada | Recebe mensagens `forwarded_to_agent` na fonte Guardados (sem mudança de código esperada além dos testes) |
| media-transcription | `_reversa_sdd/sdd/media-transcription.md` | regra-alterada | Preparo do áudio mandado ao agente; job `media.purge_object` |
| whatsapp-baileys-adapter | `_reversa_sdd/sdd/whatsapp-baileys-adapter.md` | contrato-alterado | Mensagem direta com encaminhado, citada, legenda e anexo de áudio |
| channel-contract | `_reversa_sdd/sdd/channel-contract.md` | contrato-alterado | Sem mudança de esquema; o canal de teste ganha campos opcionais (OpenAPI) |
| platform-foundation | `_reversa_sdd/sdd/platform-foundation.md` | regra-alterada | Migração 0011, composição do `SaveContent`, métricas, painel e ADR-0014 |

## 6. Delta no modelo de dados

- Resumo das mudanças:
  - migração `0011_saved_items.sql` com `themes`, `knowledge_items` e `evidence_references`;
  - fonte `kind = 'saved'`, uma por espaço;
  - gatilhos que apagam item sem evidência e tema sem item;
  - duas ações novas na auditoria.

  O conteúdo esperando pedido não toca o banco.
- Detalhe completo em: `_reversa_forward/009-guardar-por-tema/data-delta.md`

## 7. Delta de contratos externos

| Contrato | Tipo | Arquivo de detalhe |
|----------|------|--------------------|
| Comandos do agente: guardar, listar, temas, esquecer | conversa (texto fixo) | `_reversa_forward/009-guardar-por-tema/interfaces/comandos-guardar.md` |
| Mensagem direta encaminhada no canal (WhatsApp e canal de teste) | `CanonicalMessage` e HTTP do canal de teste | `_reversa_forward/009-guardar-por-tema/interfaces/canal-encaminhado.md` |

## 8. Plano de migração

1. `npm run db:migrate` aplica a `0011_saved_items.sql`. Ela é aditiva, e as fontes e mensagens existentes não mudam.
2. Reiniciar o worker, por causa do job novo `media.purge_object`, e o WhatsApp, por causa do adaptador e do agente.
3. Rollback:
   - antes de guardar algo, a migração desce limpa;
   - depois, "apagar Guardados" remove tudo, e então a migração desce.

## 9. Riscos e mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| A versão rc do Baileys não marca o encaminhado em algum tipo | alto | médio | Testes de mapeamento com mensagens Baileys de exemplo; demonstração com texto, áudio e foto encaminhados |
| Reiniciar o processo perde o que esperava pedido | baixo | médio | É o preço do "sem rastro"; o dono encaminha de novo. O onboarding avisa |
| Leva grande (mais de 20) | baixo | baixo | Guarda as 20 primeiras e avisa quantas ficaram de fora |
| Complexidade de `ask-question.ts` passar de 10 | médio | médio | D-04: roteamento numa função própria, testado à parte |
| A ajuda passar de 600 caracteres | baixo | alto | D-19: reescrever o texto inteiro, com o teste existente |
| Guardar e listar mais devagar com o áudio | baixo | baixo | O preparo do áudio é o da captura (download e cifra, poucos segundos); a transcrição segue assíncrona |
| Conteúdo de terceiros sem consentimento do grupo | médio | médio | ADR-0014: ato explícito do dono, uso pessoal, só local; apagar por item ou tudo |
| Tamanho da fatia: em torno de 20 ações, acima das ~15 da regra | médio | alto | Dá para separar o "esquece a N" e a legenda numa fatia própria, se o dono preferir |

## 10. Critério de pronto

- [ ] Todas as ações do `actions.md` marcadas `[X]`
- [ ] `cross-check.md` (se executado) sem CRITICAL nem HIGH
- [ ] `regression-watch.md` gerado
- [ ] Os 7 jobs da CI verdes no PR da fatia
- [ ] E2E pelo WhatsApp simulado: guardar por encaminhado, por citação e numa mensagem só; áudio guardado e achado pelo que foi falado; listagem com "mostra a N"; "esquece a N"; nada nos logs
- [ ] Demonstração com o chip pelo `onboarding.md`
- [ ] Re-extração reversa executada e sem regressão vermelha (recomendado, não obrigatório)

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-26 | Versão inicial gerada por `/reversa-plan` | reversa |
