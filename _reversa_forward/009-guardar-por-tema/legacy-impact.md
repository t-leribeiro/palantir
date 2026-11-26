# Legacy impact: Guardar um conteúdo com tema e recuperar pelo tema (fatia S8)

> Identificador: `009-guardar-por-tema`
> Data: `2026-11-26`
> Feature greenfield sobre as features 001 a 008, sem legado extraído de código. Âncora: `prd.md`, as specs SDD e os adendos `addenda/001-*` a `addenda/008-*` e `addenda/bug-*`.
> Política de edição no momento da execução: `allowLegacyEdits: true`, `allowedPaths: []` (projeto inteiro liberado).
> Execução: 23 de 23 ações.

## Arquivos afetados

| Arquivo afetado | Componente (spec) | Tipo | Severidade | Justificativa |
|-----------------|-------------------|------|------------|---------------|
| `migrations/0011_saved_items.sql` (novo) | knowledge-indexing, identity-and-sources | delta-de-dados | MEDIUM | `themes`, `knowledge_items` e `evidence_references`, com gatilhos de item sem evidência e de tema vazio; fonte `saved` (uma por espaço); duas ações e um alvo novos na auditoria |
| `docs/adr/0014-guardar-conteudo-encaminhado.md` (novo), `docs/adr/README.md` | platform-foundation | componente-novo | MEDIUM | Conteúdo de terceiros guardado por ato explícito do dono, uso pessoal e local, sem rastro do que não foi pedido |
| `src/modules/knowledge/domain/theme.ts`, `application/saved-items.ts`, `infrastructure/pg-saved-items.ts` (novos), `index.ts` | knowledge-indexing | componente-novo | MEDIUM | Tema normalizado e reaproveitado; guardar idempotente pela mensagem; duplicata no tema; listagem; esquecer com as chaves sem referência |
| `src/modules/agent/domain/save-command.ts`, `domain/saved-replies.ts` (novos), `domain/help.ts`, `domain/conversation-ref.ts`, `domain/original.ts` | conversational-agent | regra-alterada | MEDIUM | Comandos de guardar, listar e esquecer por palavras fixas; respostas determinísticas; ajuda nova (sem "só texto"); estado "seus itens guardados" na lista; cabeçalho "Guardado em" no "mostra a N" |
| `src/modules/agent/application/pending-forwards.ts`, `infrastructure/memory-pending-forwards.ts` (novos) | conversational-agent | componente-novo | HIGH | O encaminhado e a mídia esperam o pedido só na memória, por 10 min, e somem sem rastro |
| `src/modules/agent/application/save-content.ts`, `saved-listing.ts`, `route-message.ts` (novos), `ask-question.ts`, `manage-sources.ts`, `conversation-state.ts`, `index.ts` | conversational-agent | regra-alterada | HIGH | O encaminhado deixa de ser pergunta. O áudio mandado ao agente passa a ser conteúdo a guardar. A ordem do texto virou uma lista de passos. O "confirmo" da S5 passa o esquecer adiante. A ação pendente ganhou `forget` |
| `src/modules/agent/infrastructure/otel-save-observer.ts` (novo) | conversational-agent | componente-novo | LOW | `agent_save_total`, `agent_forwarded_total` e `agent_saved_listing_total`, só contagens |
| `src/modules/sources/application/ensure-saved-source.ts`, `infrastructure/pg-saved-source-repository.ts` (novos), `application/source-management.ts`, `application/audit.ts`, `domain/source.ts`, `infrastructure/pg-space-source-repository.ts`, `index.ts` | identity-and-sources | regra-alterada | MEDIUM | Fonte Guardados por espaço; estado `saved` por último na lista; auditoria de itens |
| `src/modules/retrieval/infrastructure/pg-search-index.ts`, `pg-source-context.ts`, `application/source-context.ts` | retrieval | regra-alterada | MEDIUM | Citação "Guardados · tema"; contexto de guardado sem vizinhas e com o tema |
| `src/modules/media/application/purge-object.ts` (novo), `index.ts` | media-transcription | componente-novo | MEDIUM | Job `media.purge_object`: apaga uma chave exata, só sem referência |
| `src/channels/whatsapp/provider/mapping.ts`, `provider.ts`, `baileys-provider.ts`, `simulated-provider.ts` | whatsapp-baileys-adapter | regra-alterada | HIGH | Mensagem direta com encaminhada, citada, legenda e áudio anunciado; o simulador entrega áudio direto |
| `src/channels/whatsapp/whatsapp-channel.ts`, `capture.ts` | whatsapp-baileys-adapter | delta-de-contrato-externo | HIGH | `CanonicalMessage` direto com `isForwarded`, `quotedExternalMessageId`, a legenda em `text` e o anexo de áudio com `fetchRef`. O esquema não mudou: continua 1.4.0 |
| `src/channels/fake/fake-channel.ts`, `http-routes.ts`, `contracts/openapi.yaml` | channel-contract (canal de teste) | delta-de-contrato-externo | LOW | `FakeAgentRequest` com campos opcionais: id, tipo, encaminhada, citada, legenda e áudio em base64. Texto até 50.000 caracteres, obrigatório só para `text` |
| `src/main/save-content.ts` (novo), `compose.ts`, `media.ts` | platform-foundation | componente-novo | HIGH | Composição do guardar por canal, preparo de mídia reaproveitável, worker de purga, varredura da espera, observadores |
| `infra/local/config/grafana/dashboards/gestao.json` | platform-foundation | regra-alterada | LOW | Três painéis: guardar, encaminhados e listagens |
| `test/**` (unit, integration, contract, e2e) | platform-foundation | componente-novo | LOW | TDD da fatia. A suíte de contrato ganhou `simulateDirect`. Os testes de esquema da 0008 e da 0010 desfazem uma migração a mais. O E2E da S2 espera o aviso de guardar para o áudio |
| `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/plano-de-fatias.md` | platform-foundation | regra-alterada | LOW | Como guardar e recuperar; onde ficam as peças; S8 em andamento |

Arquivos pré-existentes modificados: os das features 001 a 008 listados acima. Nenhum arquivo anterior ao pipeline foi alterado.

## Diff conceitual por componente

- **conversational-agent:** antes, todo texto do dono era comando ou pergunta, e a mídia recebia "só entendo texto". Agora:
  - o encaminhado e a mídia esperam o pedido na memória, com um aviso por leva;
  - "guarda em X" guarda a citada ou o que espera, até 20 por vez, e "guarda em X: texto" guarda o texto;
  - "guarda isso" pede o tema, e sem resposta em 10 min o conteúdo vai para "sem tema";
  - "guardados X" e "o que guardei sobre X" listam o tema, "temas" lista os temas, e "esquece a N" apaga com "confirmo";
  - o "mostra a N" da S7 abre o item guardado.
- **knowledge-indexing:** nasceram `KnowledgeItem` (`saved`), `EvidenceReference` e `Theme` da spec. O tema é normalizado e reaproveitado, e o item não sobrevive sem evidência.
- **identity-and-sources:** cada espaço ganha a fonte Guardados (`kind = 'saved'`), autorizada e criada no primeiro guardar. Ela aparece por último na lista da S5 e é apagada pela exclusão da S5.
- **retrieval:** o guardado entra nas buscas como qualquer mensagem, citado como "Guardados · tema". O contexto dele não traz vizinhas.
- **media-transcription:** o áudio mandado ao agente passa pelo preparo da S4, que baixa, confere, cifra e transcreve. O arquivo de um áudio esquecido sai por `media.purge_object`.
- **whatsapp-baileys-adapter:** a mensagem direta passa a informar a marca de encaminhada, a citada, a legenda e o áudio anunciado.
- **channel-contract:** sem mudança de esquema. Os campos já existiam e passam a ser preenchidos. O canal de teste ganhou os mesmos campos.
- **platform-foundation:** migração 0011, ADR-0014, composição, worker de purga, métricas e painéis.

## Preservadas

Feature greenfield: não há regras 🟢 extraídas de código para preservar.
- Os testes das features 001 a 008 continuam verdes, com uma mudança de expectativa intencional: no E2E da S2, o áudio ao agente agora recebe o aviso de guardar.
- Perguntas e respostas ao agente continuam fora da base pesquisável. Só entra o que o dono pede para guardar.
- Os comandos da S5 e o "mostra a N" da S7 continuam com as mesmas palavras.
- Nenhum número escreve em grupos, e o agente só responde a quem escreveu.

## Modificadas

Feature greenfield: nenhuma regra 🟢 alterada ou removida. Regras 🟡 que evoluem:
- **RF-07 de `conversational-agent`** (guardar com tema): implementada.
- **OQ-02 de `conversational-agent`** (áudio mandado ao agente): fechada. É sempre conteúdo a guardar, nunca pergunta.
- **RF-05 a RF-07 de `knowledge-indexing`** (item guardado, tema normalizado, item com evidência): implementadas. A nota opcional não entrou.
- **EC-03 de `knowledge-indexing`** (guardar sem tema): implementada, com o prazo contado do pedido.
- **RF-09 de `channel-contract`** (`isForwarded` e citada): passou a ser preenchida pelo adaptador WhatsApp.
- **RN-09 da S4 e RF-06 da S2** ("só texto" para mídia ao agente): substituídas para conta ativa.
