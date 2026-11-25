# Actions: Achar o mesmo assunto dito com outras palavras (fatia S6)

> Identificador: `007-achar-assunto-outras-palavras`
> Data: `2026-11-24`
> Roadmap: `_reversa_forward/007-achar-assunto-outras-palavras/roadmap.md`

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de ações | 23 |
| Paralelizáveis (`[//]`) | 13 |
| Maior cadeia de dependência | 6 (T002 → T008 → T015 → T017 → T021 → T023) |

**Prática:** TDD. Os testes de integração da busca e os E2E dos cenários de aceite (Fase 2) vêm antes do núcleo, e as demais ações escrevem o teste antes do código, no mesmo bloco.
- Os testes automáticos usam o embedder `fake`, com o léxico de conceitos, e o verificador `fake`. Nenhum teste usa rede, modelo real ou dado real.
- O motor real só aparece no `npm run eval`, no `eval:busca` e na demonstração.

**Tamanho:** 23 ações, acima das ~15 da regra das fatias. Se for preciso dividir, sem renumerar:
- a **S6a** leva a busca por sentido local, a medição e o eval: T001 a T015, T017 a T023, sem o modo `verificador`;
- a **S6b** leva o verificador externo: T016 e o modo `verificador` do T018.

Se ainda faltar folga, a busca por erro de digitação sai da S6a (a parte de trigramas do T001, do T014 e os casos `digitacao` do T005), conforme a D-16.

## Fase 1, Preparação

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T001 | **Migração `0009_semantic_search.sql`** conforme o `data-delta.md`:<br>• `palantir_norm` imutável;<br>• `embedding_models`, com um ativo e um em construção, no máximo, e dimensão de 1 a 2.000;<br>• `chunk_embeddings`, com PK (`chunk_id`, `model_id`), cascatas e índice (`model_id`, `space_id`);<br>• `message_chunks.text_norm` com índice GIN de trigramas;<br>• `down` com a remoção dos índices HNSW dinâmicos.<br>Teste de esquema na integração | - | `[//]` | `migrations/0009_semantic_search.sql` | 🟡 | `[X]` |
| T002 | **Configuração** (D-03):<br>• `PALANTIR_EMBEDDER*`, incluindo `ALLOW_REMOTE`, para URL fora da máquina e para o `voyage`;<br>• `PALANTIR_SEMANTIC_MIN_SIMILARITY`, com aviso se vazio, e `PALANTIR_TYPO_MIN_SIMILARITY`;<br>• `PALANTIR_VERIFIER*` e `TYPESAFE_API_KEY`;<br>• dimensão de 1 a 2.000; `fake` recusado em produção.<br>Testes unitários de cada recusa | - | `[//]` | `src/platform/config.ts` | 🟢 | `[X]` |
| T003 | **Módulo Terraform `embedder`** (D-02):<br>• Ollama com a versão exata fixada (publicada há ao menos duas semanas);<br>• `127.0.0.1:11434`, 2 GB, volume de modelos, `restart unless-stopped`;<br>• saída `embedder_url` em `infra/local/main.tf`.<br>O `setup` grava as variáveis novas no `.env`, sem sobrescrever as existentes. Medir o tamanho da imagem e registrar a medida nas notas; acima de ~2 GB, avaliar o Text Embeddings Inference antes de seguir | - | `[//]` | `infra/modules/embedder/main.tf` | 🟡 | `[X]` |

## Fase 2, Testes

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T004 | **Embedder `fake`** (D-11):<br>• léxico de conceitos de fixture em `test/support/embedding-concepts.ts`;<br>• palavra fora do léxico vai para um eixo por hash;<br>• vetor normalizado, com dimensão configurável.<br>Testes: as paráfrases dos cenários ficam acima de 0,8 de semelhança, e um assunto ausente fica abaixo de 0,3 | - | `[//]` | `src/modules/knowledge/infrastructure/embedders/fake.ts` | 🟢 | `[X]` |
| T005 | **Conjunto de avaliação ampliado** (D-12):<br>• `type` em todos os casos, com os 32 atuais como `exata` e `sem_evidencia`;<br>• ~30 casos sintéticos novos: paráfrase, sinônimo, erro de digitação, áudio (corpus com transcrição sintética) e negativos do mesmo assunto;<br>• o léxico do `fake` cobre os casos, para a esteira | - | `[//]` | `eval/cases.json` | 🟢 | `[X]` |
| T006 | **Integração da busca combinada** (Postgres real, embedder `fake`):<br>• paráfrase acha a mensagem, e erro de digitação também;<br>• dois espaços nunca cruzam resultados;<br>• filtros de `kind`, `sourceIds` e `deleting` em cada estratégia;<br>• mesma pergunta dá a mesma ordem;<br>• o exato não regride, e sem o embedder a resposta vem `degraded` | T001, T004 | `[//]` | `test/integration/hybrid-search.test.ts` | 🟡 | `[X]` |
| T007 | **E2E dos cenários de aceite** (`requirements.md#7`), pelo canal de teste e pelo WhatsApp simulado:<br>• paráfrase citada como as outras, e áudio por paráfrase com o ponto;<br>• erro de digitação;<br>• assunto ausente dá "não encontrei";<br>• fonte apagada some da busca por sentido;<br>• embedder fora do ar e depois a recuperação;<br>• o histórico gravado antes do embedder passa a ser achado depois da varredura | T001, T004 | `[//]` | `test/e2e/semantic-search.test.ts` | 🟡 | `[X]` |

## Fase 3, Núcleo

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T008 | **Porta `Embedder` e o adaptador `openai-compatible`** (D-01; `interfaces/embedder-e-varredura.md` §1 e §2):<br>• `EmbedderError`;<br>• lotes de 32, ordenados por `index` e normalizados;<br>• prazos de 10 s e 1,5 s;<br>• erros mapeados; `health`.<br>Regra `embedder-engine-isolated` no dependency-cruiser. Testes com `fetch` falso | T002 | - | `src/modules/knowledge/infrastructure/embedders/openai-compatible.ts` | 🟢 | `[X]` |
| T009 | **Adaptador `voyage`** (§3): `input_type` pelo propósito, `output_dimension` e URL padrão `https://ai.mongodb.com`, exigindo `ALLOW_REMOTE`. Testes com `fetch` falso | T008 | `[//]` | `src/modules/knowledge/infrastructure/embedders/voyage.ts` | 🟡 | `[X]` |
| T010 | **Registro de modelos e repositório de vetores** (D-04, D-06; §6 e §7):<br>• `ensureModel` (ativo, em construção ou reativação);<br>• pendentes com `SKIP LOCKED`, das mensagens mais recentes para as mais antigas;<br>• gravação com `ON CONFLICT DO NOTHING`;<br>• ativação transacional com o índice HNSW (nome e dimensão validados);<br>• limpeza dos aposentados em lotes; contagem de pendentes.<br>Testes de integração | T001 | `[//]` | `src/modules/knowledge/infrastructure/pg-embedding-repository.ts` | 🟡 | `[X]` |
| T011 | **Cálculo junto da indexação** (D-05, §5): depois do `replaceChunks`, calcula o sentido para o modelo ativo e o em construção. Uma falha do embedder deixa o trecho pendente, e o job termina `completed`. Testes unitários com o `fake` e um embedder que falha | T008, T010 | - | `src/modules/knowledge/application/embed-chunks.ts` | 🟡 | `[X]` |
| T012 | **Varredura `knowledge.embed.sweep`** (§6), como serviço de aplicação:<br>• ciclo de até 25 s em lotes de 32;<br>• ativa o modelo em construção quando ele fica sem pendentes;<br>• limpa os aposentados;<br>• atualiza o gauge de pendentes.<br>Testes unitários com relógio e repositório falsos | T008, T010 | - | `src/modules/knowledge/application/sweep-embeddings.ts` | 🟡 | `[X]` |
| T013 | **Domínio da busca** (D-07, D-08, D-17):<br>• `fuseRankings` (RRF, k = 60, desempate por `message_id`);<br>• `decideEvidence` por sinais (palavra, trigramas e sentido contra os limiares), que cita só o que passa no próprio sinal;<br>• `Evidence.signals`.<br>Funções puras, testes por tabela, complexidade ≤ 10 | - | `[//]` | `src/modules/retrieval/domain/fusion.ts` | 🟢 | `[X]` |
| T014 | **Estratégias de busca no SQL** (D-07), com os filtros de espaço, `kind`, `sourceIds` e `deleting` dentro de cada consulta:<br>• **palavra aproximada:** `termo <% text_norm` por termo, com a fração de termos e a melhor semelhança;<br>• **sentido:** cast e `model_id` do modelo ativo, `<=>`, top 50;<br>• **palavra:** a atual, devolvendo o seu sinal.<br>Testes de integração do `EXPLAIN` com o índice parcial | T001 | - | `src/modules/retrieval/infrastructure/pg-search-index.ts` | 🟡 | `[X]` |
| T015 | **Orquestração da busca** (D-09): sentido da pergunta com prazo de 1,5 s, três estratégias em paralelo, fusão, decisão e `SearchResponse.degraded`. O `ask-question` passa a usar a decisão, sem mudar a resposta nem a citação. Testes unitários | T008, T013, T014 | - | `src/modules/retrieval/application/search-evidence.ts` | 🟢 | `[X]` |

## Fase 4, Integração

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T016 | **Verificador externo** (D-10; `interfaces/verificador-externo.md`). Antes de escrever o adaptador, ler a referência atual da API da TypeSafe:<br>• porta `EvidenceVerifier`;<br>• adaptador `typesafe` com uma Noul por candidata, até 30 candidatas, concorrência 10, prazo de 2,5 s e modelo fixo;<br>• adaptador `fake`;<br>• na busca: p ≥ 0,7 cita, nenhuma dá "não encontrei", falha dá `degraded`.<br>Regra `verifier-engine-isolated`. Testes com `fetch` falso e com o `fake` | T015 | - | `src/modules/retrieval/infrastructure/verifiers/typesafe.ts` | 🟡 | `[X]` |
| T017 | **Composição** (`src/main/search.ts`):<br>• embedder e verificador a partir da configuração;<br>• na subida do worker: `ensureModel`, cálculo no job `knowledge.index`, varredura agendada a cada 30 s e sondagem do embedder;<br>• na API e no WhatsApp: a busca com o embedder e o verificador;<br>• aviso em log, sem conteúdo, quando um serviço remoto estiver ligado | T003, T011, T012, T015 | - | `src/main/search.ts` | 🟡 | `[X]` |
| T018 | **`npm run eval` por tipo e por modo** (D-12; `interfaces/cli-medicao-e-config.md` §4):<br>• `--modo palavra \| combinada \| verificador`; sem a opção, compara os modos;<br>• tabela por tipo com as metas e `reports/eval.json`;<br>• sem o motor no ar, avisa e roda só `palavra` | T005, T017 | - | `scripts/eval.ts` | 🟢 | `[X]` |
| T019 | **`npm run busca:modelos` e as métricas da medição** (D-13, §1):<br>• baixar modelos pela API do motor, só para URL local;<br>• funções puras em `scripts/busca/core.ts`: Recall@k, MRR, semelhança dos negativos, τ sugerido para ≥ 90% e formatação da tabela.<br>Testes unitários | T008 | `[//]` | `scripts/busca-modelos.ts` | 🟡 | `[X]` |
| T020 | **`npm run eval:busca -- preparar \| medir`** (§2 e §3):<br>• modelo de perguntas e LEIAME em `exports/medicao/busca/`;<br>• trechos resolvidos para ids no banco, só lendo;<br>• um modelo por vez, com descarga e conferência da memória;<br>• conjuntos real e sintético; `resultado.json`;<br>• saída só com números | T019 | - | `scripts/eval-busca.ts` | 🟡 | `[X]` |

## Fase 5, Polimento

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T021 | **Observabilidade** (D-14):<br>• observador OTel com `embedding_pending`, `embedding_items_total{outcome}`, `embedding_seconds`, `search_strategy_seconds{strategy}`, `search_degraded_total{reason}` e `verifier_calls_total{outcome}`;<br>• span por estratégia;<br>• painel `busca.json`;<br>• alertas `EmbeddingBacklogStalled` e `EmbedderDown`, conferidos com `promtool` | T017 | `[//]` | `infra/local/config/grafana/dashboards/busca.json` | 🟢 | `[X]` |
| T022 | **`npm run doctor` e higiene de logs:**<br>• o doctor confere se o embedder responde e se o modelo configurado foi baixado;<br>• um teste E2E procura nos logs textos de mensagem, perguntas, trechos enviados ao verificador e vetores, e nada pode aparecer | T017 | `[//]` | `scripts/doctor.mjs` | 🟢 | `[X]` |
| T023 | **Documentação:**<br>• ADR-0012: cálculo local por padrão, porta substituível por online, Jev opcional e a exigência de um ADR próprio antes de enviar dados de terceiros. O modelo escolhido entra depois da medição;<br>• `docs/adr/README.md`, README, CLAUDE.md e AGENTS.md, com os comandos e as variáveis novas;<br>• `docs/plano-de-fatias.md`: S6 🔄 e uma linha no histórico;<br>• o comentário do `index-message.ts` | T018, T020, T021 | - | `docs/adr/0012-busca-por-sentido-local-substituivel.md` | 🟢 | `[X]` |

## Notas de execução

- **T003 (motor local):** a imagem do Ollama tem 3,4 GB compactada, acima dos ~2 GB do critério. Por isso o motor é o Text Embeddings Inference `cpu-1.9.4` (0,24 GB compactada, publicado em 2026-09-15), em `127.0.0.1:8091`.
  - Ele serve um modelo por container: o `npm run setup` passa o `PALANTIR_EMBEDDER_MODEL` do `.env` ao Terraform, e trocar de modelo exige rodar o setup de novo.
  - A memória do container ficou em 3 GB. Na medição, o `multilingual-e5-small` usou 3,6 GB, então o limite pode precisar subir com o modelo escolhido.
- **T002 (configuração):** sem `PALANTIR_EMBEDDER`, o cálculo fica desligado (`off`); o `.env.example` liga o motor local. Assim a esteira, os testes e o eval não tentam um motor que não existe.
  - `fake` não é recusado em produção: segue o padrão do transcritor `fake`.
  - Entraram `PALANTIR_EMBEDDER_REQUEST_DIMENSIONS`, para pedir a dimensão a serviços como a OpenAI, e `PALANTIR_TYPO_SEARCH`, para ligar ou desligar a palavra parecida.
  - Uma variável presente no `.env` anterior agora é preservada mesmo vazia, porque um prefixo vazio é uma escolha do modelo.
- **T005 (eval):** os casos `audio` ficaram nos testes de integração e de ponta a ponta. O eval injeta mensagens de texto pelo canal de teste.
- **T010 (vetores):** a seleção dos pendentes não usa `SKIP LOCKED`. Um worker processa a varredura, e a gravação com `ON CONFLICT DO NOTHING` resolve a corrida com a indexação.
- **T012 e T017 (varredura):** a varredura roda num `setInterval` de 30 s dentro do worker, com um ciclo por vez, em vez de um job agendado no pg-boss. O efeito é o mesmo com um worker só e dispensa fila nova.
- **D-06 (troca de modelo):** numa troca entre dois modelos locais, o motor só serve o novo. O adaptador confere o modelo servido (`model_mismatch`), e a busca por sentido fica degradada até o novo ficar completo. Entre local e online, a busca continua com o anterior.
- **T016 (verificador):** uma requisição por pergunta, com uma pergunta "noul" por candidata no mesmo `state`, em vez de uma requisição por candidata. A documentação da TypeSafe recomenda juntar perguntas independentes sobre o mesmo estado. A chamada é com `fetch`, sem pacote novo.
  - A documentação mostra `jev-1.14.0` só na resposta. Se a API recusar a versão fixa, o `.env` aceita `PALANTIR_VERIFIER_MODEL=jev-latest`.
- **T018 (eval):** o modo `palavra` é a linha de base da S5 (palavra exata, sem palavra parecida). A linha de base medida em 2026-11-25 ficou assim:

  | Tipo | Acertos |
  |------|--------:|
  | exata | 100% |
  | parafrase | 0% |
  | digitacao | 16,7% |
  | sem_evidencia | 87,5% |

  Com a palavra parecida ligada, "Alguém recomendou o Jenkins?" passa a achar "Recomendo o Temporal": o eval mede isso.
- **T020 (medição):** os modelos rodam num container temporário do TEI (`:8092`), um por vez. Parar o container descarrega o modelo.
  - A medição de serviços online ficou de fora até o ADR de dados de terceiros.
  - O sintético com o `multilingual-e5-small` deu R@5 de 0,94, τ de 0,87 e 36% dos positivos acima do τ.
- **D-14 (métricas):** `verifier_calls_total` virou `search_strategy_seconds{strategy="verifier"}` mais `search_degraded_total{reason="verifier"}`. Entraram `embedder_up` e `embedding_model_activations_total`.
- **T008, correção depois da esteira:** o Text Embeddings Inference não tem `/v1/models`. Isso foi conferido num container real. A saúde do adaptador passou a tentar `/health` e depois `/v1/models`; sem isso, o alerta `EmbedderDown` dispararia sempre. A medição usa o adaptador para a saúde, o que também tirou o achado do Semgrep (requisição HTTP literal em `scripts/busca/tei.ts`). O teste no container também confirmou que o TEI devolve o id do modelo no campo `model`.
- **T007 (E2E):** o cenário pelo WhatsApp simulado não foi duplicado. A busca é a mesma nos dois canais, e o contrato não mudou.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-24 | Versão inicial gerada por `/reversa-to-do` | reversa |
