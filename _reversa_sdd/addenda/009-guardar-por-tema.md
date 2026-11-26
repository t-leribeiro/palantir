# Adendo: Guardar um conteúdo com tema e recuperar pelo tema (fatia S8)

> Feature: `009-guardar-por-tema`
> Data: `2026-11-26`
> Cenário: `greenfield`

## Vigência

Vigente desde 2026-11-26.

## Resumo da entrega

O dono encaminha ao agente um conteúdo de qualquer conversa e pede para guardar com um tema:
- "guarda em X" guarda a mensagem citada pelo "responder" ou, sem citação, tudo o que espera, até 20 itens;
- "guarda em X: texto" guarda o texto da própria mensagem;
- "guarda isso" pergunta o tema. Sem resposta em 10 min, o conteúdo vai para "sem tema".

Depois, o dono recupera pelo tema:
- "guardados X" ou "o que guardei sobre X" lista os itens do tema, até 9, com o total;
- "temas" lista os temas;
- "mostra a N" abre o item;
- "esquece a N" apaga o item, com "confirmo".

O guardado também entra nas respostas normais, citado como "Guardados · tema".

**Tipos aceitos:**
- texto e link, inteiros;
- áudio, cifrado e transcrito pela S4;
- de foto, vídeo e documento, só a legenda.

**Encaminhado sem pedido:** espera só na memória do processo do canal. O dono recebe um aviso por leva, e o conteúdo some sem rastro em 10 min (ADR-0014). Todos os comandos são reconhecidos por palavras fixas, sem LLM.

**Ajustes da demonstração com o chip:**
- O WhatsApp não marca como encaminhada a mensagem que o próprio dono escreveu. Por isso, textos que chegam juntos (até `PALANTIR_WHATSAPP_BURST_MS`, 2 s pela hora da mensagem) formam uma leva que espera o pedido.
- O "responder" acha qualquer mensagem dos últimos 10 min na memória. Depois disso, procura entre os guardados pelo id original, e a mensagem pode ir para um segundo tema.
- A resposta de repetidos ficou no plural quando são vários itens.

**Ações e entrega:**
- 26 ações concluídas: 23 do plano e 3 da demonstração (T024 a T026).
- O `progress.jsonl` tem 26 linhas `done` e uma `corrected`, a do T025.
- Entregue no PR #20, demonstrado com o chip e com os 7 jobs da CI verdes. A mutação teve nota 79,3%, e o limite do job subiu para 35 min.

## Impacto por artefato da extração

As specs continuam 🟡 PLANEJADO. Leia-as junto com este adendo, com os adendos `001` a `008` e com os de bug (`bug-*`).

| Artefato | Seção | Tipo de impacto | Delta |
|----------|-------|-----------------|-------|
| `_reversa_sdd/sdd/conversational-agent.md` | 6. Requisitos Funcionais | componente-novo | A RF-07 foi implementada sem LLM:<br>• "guarda em X", "guarda isso em X", "guardar em X", "guarda em X: texto", "guarda isso", "guardados X", "o que guardei sobre/em X", "temas" e "esquece a N" são reconhecidos por palavras fixas (`agent/domain/save-command.ts`);<br>• a ordem fica em `ask-question.ts` (lista de passos) e `route-message.ts`: guardar e resposta de tema, comandos da S5, listagem e esquecer, "mostra a N", ajuda e, por fim, a busca;<br>• as respostas são determinísticas (`saved-replies.ts`). |
| `_reversa_sdd/sdd/conversational-agent.md` | 6. Requisitos Funcionais | regra-alterada | A RF-02 continua sem classificação por LLM. A intenção `save` entra pelas palavras fixas, e o encaminhado e a mídia nunca são pergunta. |
| `_reversa_sdd/sdd/conversational-agent.md` | 14. Open Questions | regra-alterada | A OQ-02 foi fechada: áudio mandado ao agente é sempre conteúdo a guardar, nunca pergunta. O NG-05 continua valendo. |
| `_reversa_sdd/sdd/conversational-agent.md` | 11. Edge Cases e Tratamento de Erros | regra-alterada | Casos novos com resposta própria:<br>• nada para guardar;<br>• citada que não é achada;<br>• foto sem legenda;<br>• áudio sem armazenamento de mídia;<br>• tema com mais de 60 caracteres;<br>• "esquece a N" vencido ou sobre item que não é guardado.<br>Um comando no meio nunca vira tema. |
| `_reversa_sdd/sdd/conversational-agent.md` | 9. Modelo de Dados | regra-nova | A espera do encaminhado fica só em memória (`agent/infrastructure/memory-pending-forwards.ts`), por dono e canal, com teto de 100 e varredura a cada 30 s. Ela tem três partes:<br>• o que espera o pedido;<br>• os textos comuns, para a leva;<br>• tudo o que o dono mandou nos últimos 10 min, para o "responder".<br>A ação pendente em `agent_conversation_state` ganhou `forget`. |
| `_reversa_sdd/sdd/conversational-agent.md` | 8. Design e Interface | regra-alterada | A ajuda foi reescrita com "guarda em <tema>" e "guardados <tema>", tem 506 caracteres e não diz mais "só entendo texto". O "mostra a N" abre o item guardado com "Guardado em <tema> em <data>" e sem conversa em volta. |
| `_reversa_sdd/sdd/knowledge-indexing.md` | 6. Requisitos Funcionais | componente-novo | A RF-05 foi implementada sem a nota opcional. A RF-06 e a RF-07 também:<br>• `KnowledgeItem` `saved`, `EvidenceReference` e `Theme`, em `knowledge/application/saved-items.ts` e `infrastructure/pg-saved-items.ts`;<br>• o tema é normalizado e reaproveitado com o nome da primeira vez, até 60 caracteres;<br>• o mesmo conteúdo no mesmo tema não duplica (texto normalizado ou SHA-256);<br>• `savedOrigin` acha a mensagem guardada pelo id externo original. |
| `_reversa_sdd/sdd/knowledge-indexing.md` | 9. Modelo de Dados | delta-de-dados | Migração `0011_saved_items.sql`:<br>• tabelas `themes`, `knowledge_items` e `evidence_references`;<br>• gatilhos que apagam item sem evidência e tema vazio;<br>• `sources.kind = 'saved'`, uma por espaço;<br>• ações de auditoria `knowledge.item_saved` e `knowledge.item_forgotten`, com alvo `knowledge_item`. |
| `_reversa_sdd/sdd/knowledge-indexing.md` | 11. Edge Cases e Tratamento de Erros | regra-alterada | O EC-03 foi implementado. O prazo de 10 min conta a partir do "guarda isso", e o aviso de "sem tema" vem uma vez, antes da próxima resposta. |
| `_reversa_sdd/sdd/identity-and-sources.md` | 6. Requisitos Funcionais | regra-nova | Cada espaço ganha a fonte Guardados:<br>• criada no primeiro guardar (`ensure-saved-source.ts`), com conversa `palantir:guardados`, título "Guardados" e autor "Você";<br>• aparece por último na lista "grupos" da S5, como "seus itens guardados";<br>• é apagada inteira pela exclusão em duas etapas da S5. |
| `_reversa_sdd/sdd/ingestion.md` | 6. Requisitos Funcionais | regra-alterada | Guardar passa pela ingestão comum, com o id externo `<original>#<tema>`. Assim, o mesmo conteúdo pode estar em dois temas, e repetir no mesmo tema é idempotente. Perguntas e respostas ao agente continuam fora da base. |
| `_reversa_sdd/sdd/retrieval.md` | 6. Requisitos Funcionais | regra-alterada | O guardado entra nas buscas como qualquer mensagem, citado como "Guardados · tema" (`SOURCE_TITLE`). A busca por contexto devolve o tema e nenhuma vizinha. |
| `_reversa_sdd/sdd/media-transcription.md` | 6. Requisitos Funcionais | regra-alterada | O áudio mandado ao agente passa pelo preparo da S4: baixa, confere, cifra e transcreve. A cópia para outro tema reaproveita o arquivo cifrado e transcreve de novo. O arquivo de um áudio esquecido sai pelo job `media.purge_object` (outbox), só quando fica sem referência. |
| `_reversa_sdd/sdd/channel-contract.md` | 6. Requisitos Funcionais | delta-de-contrato-externo | A RF-09 passou a ser preenchida pelo adaptador WhatsApp, sem mudar a versão (1.4.0):<br>• `isForwarded`;<br>• `quotedExternalMessageId`;<br>• a legenda em `text`;<br>• o áudio direto com `fetchRef`.<br>O canal de teste aceita os mesmos campos (`FakeAgentRequest`, texto até 50.000 caracteres), e a suíte de contrato ganhou `simulateDirect`. |
| `_reversa_sdd/sdd/whatsapp-baileys-adapter.md` | 6. Requisitos Funcionais | regra-alterada | A mensagem direta informa a marca de encaminhada, a citada, a legenda (desembrulha `documentWithCaptionMessage`) e o áudio anunciado. O WhatsApp não marca como encaminhada a mensagem que o próprio dono escreveu, e a leva por hora da mensagem cobre esse caso. |
| `_reversa_sdd/sdd/platform-foundation.md` | 6. Requisitos Funcionais | componente-novo | Peças novas:<br>• composição em `src/main/save-content.ts`;<br>• worker de `media.purge_object`;<br>• métricas `agent_save_total{outcome, kind}`, `agent_forwarded_total{outcome}` e `agent_saved_listing_total{outcome}`, só com contagens, e três painéis em "Gestão";<br>• configuração `PALANTIR_WHATSAPP_BURST_MS`;<br>• ADR-0014, com o adendo da demonstração;<br>• limite do job de mutação de 35 min. |
| `_reversa_sdd/prd.md` | 4. Escopo (in) | componente-novo | "Guardar: encaminhar texto, link ou áudio ao agente e classificá-lo em um tema" foi entregue. O tema vem do dono, e a classificação automática fica para depois. |
| `_reversa_sdd/prd.md` | 9. Critérios de aceite (alto nível) | regra-alterada | O P1 (guardar) foi atendido e demonstrado com o chip: o conteúdo encaminhado com "guarda em <tema>" é confirmado e recuperado pelo tema e nas respostas normais. |

Impactos registrados: 18 linhas, assim distribuídas:
- 10 `regra-alterada`
- 4 `componente-novo`
- 2 `regra-nova`
- 1 `delta-de-dados`
- 1 `delta-de-contrato-externo`

Regras 🟡 que evoluem:
- A RF-07 e a OQ-02 de `conversational-agent`, as RF-05 a RF-07 e o EC-03 de `knowledge-indexing` e a RF-09 de `channel-contract` mudaram como descrito na tabela.
- A RN-09 da S4 e a RF-06 da S2 ("só texto" para mídia mandada ao agente) foram substituídas para conta ativa.
- A RN-08 da S3 continua valendo: nenhum número escreve em grupos, e o agente só responde a quem escreveu.

Ideia registrada fora do plano: consolidação diária do conhecimento, em `docs/plano-de-fatias.md`. Ela exige um ADR que substitua a parte do ADR-0014 que proíbe gravar o que o dono não pediu.

## Regras sob vigilância

W001 a W014, em `_reversa_forward/009-guardar-por-tema/regression-watch.md` (seção Observações).

## Fontes

- `_reversa_forward/009-guardar-por-tema/legacy-impact.md`
- `_reversa_forward/009-guardar-por-tema/regression-watch.md`
- `_reversa_forward/009-guardar-por-tema/requirements.md` (incluindo a sessão da demonstração)
- `_reversa_forward/009-guardar-por-tema/roadmap.md` (D-01 a D-20)
- `_reversa_forward/009-guardar-por-tema/data-delta.md`
- `_reversa_forward/009-guardar-por-tema/progress.jsonl`
- `_reversa_forward/009-guardar-por-tema/actions.md` (Notas de execução)
- `_reversa_forward/009-guardar-por-tema/interfaces/`
- `docs/adr/0014-guardar-conteudo-encaminhado.md`
