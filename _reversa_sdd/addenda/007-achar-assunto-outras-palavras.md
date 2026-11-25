# Adendo: Achar o mesmo assunto dito com outras palavras (fatia S6)

> Feature: `007-achar-assunto-outras-palavras`
> Data: `2026-11-25`
> Cenário: `greenfield`

## Vigência

Vigente desde 2026-11-25.

## Resumo da entrega

O dono pergunta com as palavras dele e acha a mensagem mesmo quando quem escreveu usou outras, ou errou a digitação. Vale para texto e para trechos de áudio transcritos, importados ou ao vivo. A busca junta três formas: a palavra, a palavra parecida (trigramas) e o sentido (embeddings). Só é citado o que passa no limiar da própria forma, e a citação é igual à das outras respostas.

O sentido é calculado no computador do dono, pelo Text Embeddings Inference em CPU com o `multilingual-e5-base` (ADR-0012). Trocar por um serviço online (Voyage ou OpenAI) é configuração, mas só com liberação explícita. Um verificador externo opcional, o Jev da TypeSafe, pode julgar as candidatas no lugar dos limiares. Ele fica desligado por padrão. Pelo ADR-0013, recebe só a pergunta, o texto e o autor por apelido, e só nos testes do dono.

As 23 ações foram concluídas. O `progress.jsonl` tem 27 linhas: 23 `done` e 4 `corrected` (T008, T012, T016 e T021). A entrega está no PR #16.

A demonstração pelo WhatsApp, em 2026-11-25, expôs quatro problemas, corrigidos no mesmo PR:
- a varredura do histórico parava em silêncio, porque o lote de 32 trechos passava do prazo;
- o adaptador do Jev mandava autor, conversa e data;
- faltavam métricas do que o Jev decide;
- o Jev recusou a resposta certa de uma pergunta real, com nota 0,51 contra o mínimo de 0,7. O `.env` do dono passou a 0,5, de forma provisória, e o padrão do código continua 0,7.

## Impacto por artefato da extração

As specs continuam 🟡 PLANEJADO. Leia-as junto com este adendo, com os adendos `001` a `006` e com os de bug (`bug-*`). A spec `conversational-agent` não mudou: o agente só passa a usar a decisão nova da busca.

| Artefato | Seção | Tipo de impacto | Delta |
|----------|-------|-----------------|-------|
| `_reversa_sdd/sdd/knowledge-indexing.md` | 6. Requisitos Funcionais | componente-novo | A RF-03 e a RF-04 foram entregues em parte.<br>• A porta `Embedder` tem os adaptadores `openai-compatible`, `voyage` e `fake`, só em `knowledge/infrastructure/embedders/`.<br>• Cada trecho ganha o vetor do modelo ativo logo depois do job `knowledge.index`.<br>• Uma varredura no worker completa os pendentes a cada 30 s, com 120 s de prazo por lote. Quando adia, registra em log só a contagem.<br>• Uma troca de modelo nasce em construção e só ativa quando completa.<br>• A divisão em trechos de 512 tokens continua adiada: há um trecho por mensagem. |
| `_reversa_sdd/sdd/knowledge-indexing.md` | 9. Modelo de Dados | delta-de-dados | Migração `0009_semantic_search.sql`:<br>• `embedding_models`, com um modelo ativo e um em construção;<br>• `chunk_embeddings`, com PK `(chunk_id, model_id)` e cascata pelo trecho;<br>• a função `palantir_norm`;<br>• `message_chunks.text_norm`, com índice de trigramas.<br>O modelo e a dimensão ficam no registro, não numa coluna do trecho. |
| `_reversa_sdd/sdd/knowledge-indexing.md` | 11. Edge Cases e Tratamento de Erros | regra-alterada | O EC-01 e o EC-05 foram implementados:<br>• com o motor fora do ar, o índice textual é gravado e o vetor fica pendente para a varredura, sem falhar o job;<br>• dimensão ou modelo diferentes do configurado viram `EmbedderError` (`dimension_mismatch`, `model_mismatch`), e nada é gravado. |
| `_reversa_sdd/sdd/knowledge-indexing.md` | 14. Open Questions | regra-alterada | A OQ-01 está fechada (ADR-0012): `intfloat/multilingual-e5-base`, 768 dimensões, prefixos `query: ` e `passage: `, τ 0,86. O modelo foi escolhido pela medição com 27 perguntas reais do T3 (R@10 real 0,68) e o conjunto sintético. O motor usa até 6 GB. |
| `_reversa_sdd/sdd/retrieval.md` | 6. Requisitos Funcionais | regra-alterada | A RF-02 e a RF-03 foram implementadas: palavra, palavra parecida e sentido, com 50 candidatas cada. Cada forma aplica no próprio SQL os filtros de espaço, tipo, fonte e exclusão. A fusão é RRF com k=60. Substitui a divergência da S0, em que o score era a fração dos termos. A palavra parecida pode ser desligada com `PALANTIR_TYPO_SEARCH=off`. |
| `_reversa_sdd/sdd/retrieval.md` | 6. Requisitos Funcionais | regra-alterada | Na RF-08, o `low_confidence` passou a valer por forma de busca: só é citado o que passa no próprio sinal, a palavra pelo limiar léxico e o sentido pelo τ do modelo ativo. Na RF-09, o sentido da pergunta tem 1,5 s de prazo. Se falhar, a busca responde por palavra e devolve `degraded: true`. |
| `_reversa_sdd/sdd/retrieval.md` | 6. Requisitos Funcionais | componente-novo | O verificador externo opcional fica atrás da porta `EvidenceVerifier`, só em `retrieval/infrastructure/verifiers/` (regra `verifier-engine-isolated`).<br>• O adaptador da TypeSafe manda uma requisição por pergunta, com uma noul por candidata e as 30 primeiras da fusão, em até 2,5 s.<br>• Cita as candidatas com p ≥ mínimo, ordenadas pela probabilidade. Se nenhuma passar, a resposta é "não encontrei". Se o Jev falhar, a decisão volta aos sinais e a busca marca `degraded`.<br>• Desligado por padrão. Ligar exige `PALANTIR_VERIFIER=typesafe`, `PALANTIR_VERIFIER_ALLOW_REMOTE=true` e a chave.<br>• O mínimo padrão é 0,7. O `.env` do dono está em 0,5, de forma provisória. |
| `_reversa_sdd/sdd/retrieval.md` | 12. Segurança e Privacidade | regra-nova | ADR-0013: ao verificador saem só a pergunta e, por candidata, o texto e o apelido do autor ("pessoa N", refeito a cada pergunta). Um nome de autor citado na pergunta vira o mesmo apelido (`verifiers/pseudonyms.ts`). Nome do autor, título da conversa, data e ids ficam na máquina. O uso é liberado só para os testes do dono. O uso contínuo exige retenção zero ou um prazo por escrito, além de consentimento que mencione o envio ao exterior. |
| `_reversa_sdd/sdd/retrieval.md` | 14. Open Questions | regra-alterada | A OQ-01 foi respondida em parte: há um limiar por forma de busca, ajustável no `.env`, e o τ saiu de só 5 perguntas sem resposta. A OQ-02 segue aberta e agora tem dado: o R@10 real do sentido foi 0,68, abaixo dos 90% a partir dos quais o ADR-0012 manda considerar a reordenação local. Calibrar o Jev ou deixá-lo só reordenar também ficou para depois. |
| `_reversa_sdd/sdd/platform-foundation.md` | 6. Requisitos Funcionais | componente-novo | Peças novas:<br>• módulo Terraform `embedder` (TEI `cpu-1.9.4` em `127.0.0.1:8091`, um modelo por container, `MAX_BATCH_TOKENS=2048`);<br>• variáveis `PALANTIR_EMBEDDER*`, `PALANTIR_SEMANTIC_MIN_SIMILARITY`, `PALANTIR_TYPO_*` e `PALANTIR_VERIFIER*`, com liberação explícita para serviço remoto;<br>• varredura no worker e sondagem do motor (`embedder_up`);<br>• métricas `embedding_pending`, `embedding_items_total`, `embedding_seconds`, `embedding_model_activations_total`, `search_strategy_seconds`, `search_degraded_total`, `verifier_calls_total` e `verifier_candidates_total`, só com contagens;<br>• painel "Busca" e alertas `EmbeddingBacklogStalled` e `EmbedderDown`;<br>• `doctor` com o motor;<br>• `npm run eval` por tipo de pergunta e por modo (`palavra`, `combinada`, `verificador`);<br>• `npm run busca:modelos` e `npm run eval:busca`, com as perguntas reais só em `exports/medicao/busca/`;<br>• regra `embedder-engine-isolated`. |
| `_reversa_sdd/prd.md` | 4. Escopo (in) | componente-novo | A busca híbrida (palavra exata, aproximada e por sentido) foi entregue, com o filtro do espaço antes da busca e os filtros por conversa e por tipo. Os filtros por autor e por período continuam pendentes. |
| `_reversa_sdd/prd.md` | 7. Dependências externas | regra-alterada | O provedor de embeddings, que estava `[INDEFINIDO]`, foi decidido: local por padrão (TEI com o `multilingual-e5-base`), trocável por Voyage ou OpenAI só com liberação explícita (ADR-0012). O provedor de LLM continua indefinido, para a S9. |
| `_reversa_sdd/prd.md` | 3. Métricas de sucesso | regra-alterada | A meta do "não encontrei", que estava `[INDEFINIDO]`, foi fixada em ≥ 90% no `npm run eval`, nos casos `sem_evidencia`. O eval agora separa os acertos por tipo de pergunta: `exata`, `parafrase`, `digitacao` e `sem_evidencia`. |

Impactos registrados: 13 linhas, assim distribuídas:
- 7 `regra-alterada`
- 4 `componente-novo`
- 1 `delta-de-dados`
- 1 `regra-nova`

Regras 🟡 que evoluem:
- A RF-03 e a RF-08 de `retrieval`, a RF-03 e a RF-04 de `knowledge-indexing` e a OQ-01 de `knowledge-indexing` mudaram como descrito na tabela.
- A RF-09 de `retrieval` (modo `degraded`) foi implementada, e o prazo do sentido da pergunta foi fixado em 1,5 s. Na demonstração, ele às vezes estourou com a máquina apertada de memória.

## Regras sob vigilância

W001 a W014, em `_reversa_forward/007-achar-assunto-outras-palavras/regression-watch.md` (seção Observações). O W009 descreve o mínimo padrão do código, de 0,7. O `.env` do dono usa 0,5, de forma provisória.

## Fontes

- `_reversa_forward/007-achar-assunto-outras-palavras/legacy-impact.md`
- `_reversa_forward/007-achar-assunto-outras-palavras/regression-watch.md`
- `_reversa_forward/007-achar-assunto-outras-palavras/requirements.md`
- `_reversa_forward/007-achar-assunto-outras-palavras/roadmap.md` (D-01 a D-17)
- `_reversa_forward/007-achar-assunto-outras-palavras/progress.jsonl`
- `_reversa_forward/007-achar-assunto-outras-palavras/actions.md` (Notas de execução)
- `_reversa_forward/007-achar-assunto-outras-palavras/interfaces/`
- `docs/adr/0012-busca-por-sentido-local-substituivel.md`
- `docs/adr/0013-envio-de-dados-de-terceiros-ao-verificador.md`
