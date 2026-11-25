# Roadmap: Achar o mesmo assunto dito com outras palavras (fatia S6)

> Identificador: `007-achar-assunto-outras-palavras`
> Data: `2026-11-24`
> Requirements: `_reversa_forward/007-achar-assunto-outras-palavras/requirements.md`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA

## 1. Resumo da abordagem

O módulo `knowledge` ganha a porta `Embedder`, com três adaptadores:
- `openai-compatible`: fala com qualquer serviço que tenha `POST /v1/embeddings`. Hoje é o Ollama local; amanhã pode ser a OpenAI.
- `voyage`: o fornecedor que a Anthropic indica.
- `fake`: para os testes.

Trocar o cálculo local por um online é só configuração, como no transcritor da S4. O motor local roda num container novo (módulo Terraform `embedder`), porque o Speaches não calcula embeddings.

**Cálculo:**
- Depois de gravar os trechos, o job `knowledge.index` tenta calcular o sentido deles na hora. Se o cálculo falhar, o job não falha.
- Uma varredura a cada 30 s completa os pendentes em lotes. Ela cobre os trechos que falharam e o histórico já guardado, e é ela que faz o cálculo do histórico na subida e a troca de modelo.
- Os vetores ficam numa tabela própria, ligada ao trecho e ao modelo. Um registro de modelos diz qual está ativo. Assim, dois modelos convivem durante a troca.

**Busca:**
- O módulo `retrieval` roda três consultas: por palavra (a atual), por palavra aproximada (trigramas) e por sentido (distância de cosseno no modelo ativo).
- Cada consulta tem o filtro de espaço, tipo, fonte e exclusão dentro dela.
- Uma função pura funde as três por posição (RRF, k = 60).
- O "não encontrei" não olha o RRF. Ele olha os sinais absolutos de cada forma de busca: a fração de termos, a semelhança de trigramas e a semelhança de sentido, contra limiares calibrados pela medição.
- Um verificador externo opcional (Jev, porta `EvidenceVerifier`) pode substituir essa decisão e reordenar as candidatas. Ele fica desligado por padrão.

**Medição e eval:**
- O `npm run eval` ganha casos por tipo e compara os modos.
- Um comando novo de medição (`eval:busca`) escolhe o modelo com o conjunto sintético e com as perguntas reais do T3 em `exports/`, mostrando só números.

**O que não muda:** a resposta continua determinística, e nenhum contrato do canal muda.

## 2. Princípios aplicados

`.reversa/principles.md` não existe neste projeto. Valem os princípios do `CLAUDE.md` e do PRD:

| Princípio | Como a feature se relaciona | Status |
|-----------|------------------------------|--------|
| WhatsApp-first, not WhatsApp-only | Nada no canal muda; a busca vale igual para o canal de teste e o WhatsApp | respeita |
| Knowledge-first, not chatbot-first | Melhora a recuperação da evidência, sem gerar texto | respeita |
| Evidence over hallucination | Só é citado o que passa no próprio sinal, ou no verificador; a meta de "não encontrei" sobe para ≥ 90% | respeita |
| Security First e Local First | Cálculo local por padrão; serviço online e verificador só com opção explícita, aviso na subida e ADR de dados de terceiros antes de usar com dados reais | respeita |
| Privacidade dos dados de terceiros | Vetores e textos fora de logs, métricas e relatórios; perguntas reais só em `exports/` | respeita |
| IaC com Terraform | Motor local num módulo Terraform, como o transcritor | respeita |
| Complexidade ≤ 10 e testes de arquitetura | Fusão e decisão em funções puras no domínio; adaptadores isolados por regra nova do dependency-cruiser | respeita |
| Fora do escopo da v0.1 (CLAUDE.md) | Sem LLM nas respostas (S9); o verificador só dá probabilidades | respeita |

## 3. Decisões técnicas

| ID | Decisão | Justificativa | Alternativas descartadas | Confidência |
|----|---------|----------------|--------------------------|-------------|
| D-01 | Porta `Embedder` em `knowledge/application`, com `embed(texts, purpose: "document" \| "query")`, `model`, `dimensions` e `health()`. Os adaptadores ficam em `knowledge/infrastructure/embedders/`: `openai-compatible`, `voyage` e `fake`. Uma regra nova do dependency-cruiser, `embedder-engine-isolated`, impede que outros pontos conheçam o motor | O usuário pediu que o cálculo seja facilmente substituível por um online (RF-13). Repete o padrão da porta `Transcriber` (S4) | Chamar o motor direto do worker; um SDK de fornecedor no núcleo | 🟢 |
| D-02 | Motor local: Ollama num container, pelo módulo Terraform `infra/modules/embedder`. Ele escuta em `127.0.0.1:11434`, tem 2 GB de memória e um volume para os modelos, com a versão exata da imagem fixada na ação. Ele expõe `/v1/embeddings` | Troca de modelo por nome, sem reiniciar (a medição testa vários). Modelos quantizados cabem no limite de 2 GB. API compatível com a da OpenAI, então o mesmo adaptador serve para o online | Speaches (o `openapi.json` dele, conferido em 2026-11-24, não tem `/v1/embeddings`); Text Embeddings Inference (um modelo por container, o que exige reiniciar para medir); ONNX no próprio worker (dependência nativa pesada no processo e disputa de CPU sem limite) | 🟡 |
| D-03 | A configuração segue a do transcritor:<br>• `PALANTIR_EMBEDDER` (`openai-compatible` \| `voyage` \| `fake` \| `off`);<br>• `_URL`, `_MODEL`, `_API_KEY` e `_DIMENSIONS`;<br>• `_QUERY_PREFIX` e `_DOCUMENT_PREFIX`, para os modelos que pedem prefixo;<br>• `PALANTIR_EMBEDDER_ALLOW_REMOTE`, exigida para URL fora da máquina e para o `voyage`.<br>Sem a liberação, a configuração recusa a subida e diz o motivo | RN-05: nada sai da máquina sem escolha explícita; mesma experiência da S4 | Detectar o fornecedor pela URL; liberar o remoto por padrão | 🟢 |
| D-04 | Os vetores ficam na tabela `chunk_embeddings` (`chunk_id`, `model_id`, `embedding vector`, sem dimensão fixa). `embedding_models` registra o fornecedor, o modelo, a dimensão, os prefixos, o limiar de sentido e o estado (`building`, `active` ou `retired`), com um só modelo ativo. Cada modelo tem o seu índice HNSW parcial, com cast para a dimensão dele, criado na ativação. A dimensão vai até 2.000 | Dois modelos convivem durante a troca (RF-10), e a cascata de exclusão vem do trecho (RN-08). O HNSW do pgvector exige dimensão fixa e aceita até 2.000 no tipo `vector`; o índice parcial com cast resolve isso sem uma coluna por modelo | Coluna `embedding vector(n)` em `message_chunks`, como na spec (impede a convivência e muda de tipo a cada troca de modelo); `halfvec` (só se um dia passar de 2.000) | 🟡 |
| D-05 | Quando calcular:<br>• o job `knowledge.index` calcula o sentido dos trechos da mensagem logo depois de gravá-los, fora da transação, com um prazo de 10 s;<br>• se falhar, os trechos ficam pendentes (a falta da linha em `chunk_embeddings` é o "pendente");<br>• a varredura `knowledge.embed.sweep` (pg-boss agendado, uma por vez) roda a cada 30 s, processa lotes de 32 trechos por até 25 s, das mensagens mais recentes para as mais antigas, e cobre o modelo ativo e o modelo em construção | RNF de 60 s para o texto ao vivo; o cálculo do histórico sem enfileirar milhares de jobs; nenhuma falha do motor para a indexação por palavra (RN-07) | Um job por mensagem (milhares na subida); calcular dentro da transação do trecho (o motor fora do ar pararia a indexação) | 🟡 |
| D-06 | Ativação:<br>• **primeiro modelo:** fica `active` na hora, e a busca por sentido cresce conforme o histórico é calculado;<br>• **troca de modelo (RF-10):** o novo fica `building`; quando não há mais trechos pendentes, uma transação o ativa, aposenta o anterior e cria o índice. A limpeza dos vetores aposentados vem depois, em lotes.<br>Durante a troca, a pergunta é calculada com o modelo ativo, cuja configuração fica no registro. Os segredos vêm do ambiente | Nada a esperar na primeira subida; a troca não deixa a busca sem resposta | Esperar o histórico inteiro antes de ativar o primeiro modelo; trocar na hora (a busca por sentido ficaria vazia) | 🟡 |
| D-07 | Busca combinada no `retrieval`, com três estratégias e o top 50 de cada:<br>• **palavra:** a consulta atual;<br>• **palavra aproximada:** para cada termo da pergunta, `termo <% text_norm` (pg_trgm, sobre o texto sem acento e em minúsculas);<br>• **sentido:** `ORDER BY embedding <=> $q`, só no modelo ativo.<br>Cada uma tem o filtro de espaço, tipo, `sourceIds` e `deleting` dentro da consulta. A função pura `fuseRankings` (RRF, k = 60) desempata por `message_id`, e `bestPerMessage` continua | Spec `retrieval` RF-02 e RF-03; RN-02 (isolamento dentro de cada consulta); determinismo (RF-03) | Soma ponderada dos scores (exige calibrar escalas); uma consulta só com UNION (difícil de testar e de medir por estratégia) | 🟢 |
| D-08 | Decisão do "não encontrei" por sinais absolutos. Há evidência se algum resultado tem:<br>• fração de termos ≥ `PALANTIR_LOW_CONFIDENCE_THRESHOLD` (0,5 hoje);<br>• semelhança de trigramas ≥ `PALANTIR_TYPO_MIN_SIMILARITY` (0,6 inicial);<br>• semelhança de sentido ≥ o limiar do modelo ativo (no registro, sugerido pela medição).<br>Só são citados os resultados que passam no próprio sinal, na ordem do RRF | O RRF só ordena e não diz se a melhor candidata é boa. Os limiares por sinal são calibráveis para ≥ 90% (RF-05) e mantêm o exato com o critério atual (RN-03) | Limiar sobre o score do RRF; sempre citar as 3 primeiras | 🟡 |
| D-09 | Modo degradado: o sentido da pergunta tem um prazo de 1,5 s. Fora do ar ou estourado o prazo, a busca roda sem a estratégia de sentido e devolve `degraded: true` (campo novo em `SearchResponse`). O mesmo vale para o verificador | Spec `retrieval` RF-09 e EC-02; RN-07 | Esperar o motor; falhar a pergunta | 🟢 |
| D-10 | Verificador opcional, a porta `EvidenceVerifier` em `retrieval/application`, com `verify(question, candidates) → probabilidade por candidata`. O adaptador `typesafe` fica em `retrieval/infrastructure/verifiers/` (regra `verifier-engine-isolated`) e faz uma pergunta "Noul" por candidata, em português:<br>• até 30 candidatas da fusão, com concorrência 10 e prazo total de 2,5 s;<br>• modelo fixado (`jev-1.14.0`, não o alias `latest`);<br>• cita as candidatas com p ≥ 0,7, ordenadas por p; nenhuma ≥ 0,7 dá "não encontrei".<br>Configuração: `PALANTIR_VERIFIER` (`off` \| `typesafe` \| `fake`), `PALANTIR_VERIFIER_ALLOW_REMOTE=true` obrigatório, `TYPESAFE_API_KEY` | Esclarecimento 2b (RN-09, RF-14). O limiar de partida (0,7 e 0,3) vem da documentação da TypeSafe e é recalibrado pelo eval | Usar o Jev como busca (ele só julga candidatas); um "Choice" entre as candidatas (uma por pergunta não serve para várias evidências) | 🟡 |
| D-11 | Embedder `fake` determinístico para testes, unitários a E2E, sem rede: cada palavra é mapeada para um "conceito" de um léxico de fixture (por exemplo, custo, gastos e baratear → o mesmo eixo), e o vetor é normalizado. As paráfrases dos cenários de aceite rodam na esteira | A esteira não baixa modelos nem tem o motor; os critérios de aceite precisam rodar a cada PR | Testar só com o motor real (fora da esteira); pular o sentido nos E2E | 🟢 |
| D-12 | O `npm run eval` ganha um `type` por caso (`exata`, `parafrase`, `digitacao`, `audio`, `sem_evidencia`) e ~30 casos novos sintéticos, incluindo negativos do mesmo campo de assunto. `--modo palavra \| combinada \| verificador` roda um modo; sem a opção, roda `palavra` e `combinada` (mais `verificador` se configurado) e imprime a comparação por tipo. Ele usa o embedder configurado, então a medição real exige o motor no ar | RF-09; "o eval mostra a melhora" (plano de fatias) | Um eval novo separado; casos sem tipo | 🟢 |
| D-13 | Medição de modelos: `npm run eval:busca -- preparar \| medir` e `npm run busca:modelos -- <id>`.<br>• `preparar` cria `exports/medicao/busca/perguntas.json` com o modelo e um LEIAME. O usuário escreve a pergunta e um trecho literal da mensagem esperada.<br>• `medir` resolve os trechos para ids no T3, só lendo o banco; para cada modelo candidato, um por vez (descarregando o anterior), calcula em memória o sentido dos trechos do T3 e do conjunto sintético.<br>• A saída tem só números: Recall@1/5/10, MRR, semelhança dos negativos, limiar sugerido para ≥ 90%, mensagens por segundo e memória do container | RN-06, RF-08; a lição da S4 (um modelo por vez, só números na saída) | Gravar os vetores de medição no banco; medir só o sintético | 🟡 |
| D-14 | Observabilidade:<br>• métricas `embedding_pending` (gauge), `embedding_items_total{outcome}`, `embedding_seconds`, `search_strategy_seconds{strategy}`, `search_degraded_total{reason}` e `verifier_calls_total{outcome}`;<br>• um span por estratégia na busca;<br>• painel "Busca";<br>• alertas `EmbeddingBacklogStalled` (pendentes sem cair por 30 min) e `EmbedderDown` | RF-11; padrão das S4 e S5 (sem prefixo, sem conteúdo) | Só logs | 🟢 |
| D-15 | Privacidade:<br>• nenhum texto, pergunta ou vetor em log, métrica ou relatório;<br>• na subida, um aviso em log quando o embedder remoto ou o verificador estiverem ligados;<br>• ADR-0012 registra o padrão local, a porta substituível e o Jev opcional, e diz que ligar um serviço externo com dados reais exige um ADR próprio sobre o envio de dados de terceiros | RN-05, RN-08, RN-09; pendência registrada nos requisitos | Deixar a decisão só no README | 🟢 |
| D-16 | Corte de escopo, se a fatia passar de ~15 ações: primeiro sai o verificador (RF-14), depois a busca por erro de digitação (RF-04). A porta `EvidenceVerifier` e o campo `degraded` ficam mesmo assim | Premissa dos requisitos | Cortar a medição real (é Must) | 🟡 |
| D-17 | Sem mudança no contrato do canal nem no `AgentReply`. A `Evidence` ganha um campo interno opcional, `signals` (os sinais de cada estratégia), usado pelo eval e pelos testes e nunca mostrado ao usuário | RN-10 (citação igual) e RF-12 | Versão nova do contrato | 🟢 |

## 4. Premissas

| Premissa | Origem (`requirements.md` seção) | Risco se errada |
|----------|----------------------------------|-----------------|
| Uma mensagem continua sendo um trecho; só a transcrição se divide em blocos (S4) | 10. Lacunas | Mensagem muito longa vira um vetor só e perde precisão. Mitigação: o limite de 50.000 caracteres continua, e a divisão entra quando aparecer o caso |
| Há ao menos um modelo aberto que cabe em 2 GB, roda em CPU e acerta paráfrases em português | 4. RN-06, 6. RNF Recursos | Nenhum candidato serve. A medição mostra isso, e o serviço online já está pronto por configuração |
| O verificador é medido só com o conjunto sintético até existir o ADR de dados de terceiros | 10. Lacunas | O efeito no T3 real fica desconhecido; o usuário decide no ADR se mede com as perguntas reais |

## 5. Delta arquitetural

| Componente | Arquivo de origem no legado | Tipo de mudança | Resumo |
|------------|------------------------------|-----------------|--------|
| `knowledge-indexing` | `_reversa_sdd/sdd/knowledge-indexing.md#6. Requisitos Funcionais` | componente-novo | Porta `Embedder` e adaptadores, cálculo depois da indexação, varredura de pendentes, registro de modelos, ativação e troca |
| `retrieval` | `_reversa_sdd/sdd/retrieval.md#6. Requisitos Funcionais` | regra-alterada | Três estratégias com filtros em cada uma, fusão RRF, decisão por sinais, `degraded` e a porta `EvidenceVerifier` |
| `conversational-agent` | `_reversa_sdd/sdd/conversational-agent.md#6. Requisitos Funcionais` | regra-alterada | Usa a decisão nova do `retrieval`; a resposta e a citação não mudam |
| `platform-foundation` | `_reversa_sdd/sdd/platform-foundation.md#6. Requisitos Funcionais` | componente-novo | Módulo Terraform `embedder`, configuração, varredura no worker, sondagem do motor, painel "Busca", alertas, comandos `eval:busca` e `busca:modelos`, `doctor` e `setup` |
| Avaliação (`scripts/eval.ts`, `eval/cases.json`) | `_reversa_sdd/addenda/001-walking-skeleton.md` | regra-alterada | Casos por tipo, modos de comparação e relatório por tipo |

Arquivos que a mudança deve tocar (rascunho para o `legacy-impact.md`):
- **módulos:** `src/modules/knowledge/**`, `src/modules/retrieval/**`, `src/modules/agent/application/ask-question.ts`;
- **composição e plataforma:** `src/main/compose.ts`, `src/main/search.ts` (novo, composição da busca e da varredura), `src/platform/config.ts`;
- **banco e infraestrutura:** `migrations/0009_semantic_search.sql`, `infra/modules/embedder/`, `infra/local/main.tf`, `infra/local/config/grafana/dashboards/busca.json`, `infra/local/config/prometheus/rules.yml`;
- **comandos:** `scripts/eval.ts`, `eval/cases.json`, `scripts/eval-busca.ts`, `scripts/busca-modelos.ts`, `scripts/busca/*`, `scripts/infra.mjs` (variáveis do `.env`), `scripts/doctor.mjs`, `package.json`, `.dependency-cruiser.cjs`;
- **testes:** `test/**`;
- **documentação:** `docs/adr/0012-*.md`, README, CLAUDE.md, AGENTS.md, `docs/plano-de-fatias.md`.

## 6. Delta no modelo de dados

- Resumo das mudanças:
  - tabelas `embedding_models` (registro, um ativo) e `chunk_embeddings` (vetor por trecho e modelo, cascata pelo trecho);
  - função imutável `palantir_norm(text)` e coluna gerada `message_chunks.text_norm`, com índice GIN de trigramas;
  - os índices HNSW parciais por modelo são criados na ativação, não na migração.
- Detalhe completo em: `_reversa_forward/007-achar-assunto-outras-palavras/data-delta.md`

## 7. Delta de contratos externos

O contrato do canal (`contracts/channel/*.schema.json`) não muda.

| Contrato | Tipo | Arquivo de detalhe |
|----------|------|--------------------|
| Porta `Embedder`: local e online (`/v1/embeddings`, Voyage) e a varredura `knowledge.embed.sweep` | HTTP de saída e fila | `interfaces/embedder-e-varredura.md` |
| Verificador externo (TypeSafe, `POST /v1/systemone`) | HTTP de saída | `interfaces/verificador-externo.md` |
| Comandos `eval`, `eval:busca` e `busca:modelos` e as variáveis de ambiente | arquivo e terminal | `interfaces/cli-medicao-e-config.md` |

## 8. Plano de migração

1. `npm run db:migrate`: aplica a `0009`. As tabelas novas começam vazias, e a coluna gerada `text_norm` reescreve `message_chunks` (3.247 linhas, segundos).
2. `npm run setup`: sobe o container `palantir-embedder` e grava as variáveis novas no `.env`, com o embedder local e o verificador `off`.
3. `npm run busca:modelos -- <id>`: baixa os candidatos. Depois, `npm run eval:busca -- preparar`. O usuário escreve 15 a 20 perguntas reais do T3, e `npm run eval:busca -- medir` mostra a tabela.
4. O usuário escolhe o modelo (`PALANTIR_EMBEDDER_MODEL`, mais o limiar sugerido) e reinicia o worker. A varredura calcula o histórico (3.391 mensagens, minutos) e o painel mostra os pendentes caindo.
5. `npm run eval` mostra palavra contra combinada por tipo.
6. Volta atrás:
   - `PALANTIR_EMBEDDER=off` volta à busca só por palavra, sem perder dados;
   - a migração `down` remove as tabelas e a coluna;
   - nada no histórico original muda.

## 9. Riscos e mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| A CPU é disputada com o transcritor (154 áudios do T3 na fila) | médio | alto | Lotes pequenos com concorrência 1; os limites de memória e CPU do container no Terraform; `PALANTIR_TRANSCRIPTION=off` durante o cálculo do histórico, se for preciso |
| A busca por sentido dilui os acertos exatos no RRF | alto | médio | O sinal de palavra continua decidindo a citação (D-08); o eval tem o tipo `exata` e bloqueia regressão (RN-03) |
| O limiar de sentido calibrado em poucos casos se ajusta demais a eles | alto | médio | Conjunto sintético com negativos do mesmo assunto mais as perguntas reais; o limiar sugerido fica entre os pontos medidos, não colado num caso |
| A imagem do Ollama é grande e pesa no disco e no job `infra` da esteira | médio | médio | A ação mede a imagem. Se passar de ~2 GB, a alternativa é o Text Embeddings Inference (CPU), atrás da mesma porta |
| O Jev não funciona bem em português | baixo | médio | Desligado por padrão; o eval mostra o efeito antes de qualquer decisão |
| Dimensão do modelo acima do limite do índice | médio | baixo | A configuração recusa dimensão acima de 2.000; o Voyage é pedido com `output_dimension` 1024 |
| A fatia passa de 15 ações | médio | alto | Ordem de corte em D-16 |
| Uma pergunta n07 ("Cassandra") ainda passa pelo sinal de palavra (um termo de dois) | médio | já ocorre | Os negativos novos medem isso; se continuar abaixo de 90%, a medição sugere o limiar de palavra junto (configurável) |

## 10. Critério de pronto

- [ ] Todas as ações do `actions.md` marcadas `[X]`
- [ ] `cross-check.md` (se executado) sem CRITICAL nem HIGH
- [ ] `regression-watch.md` gerado
- [ ] Os 7 jobs da esteira verdes, com os cenários de aceite rodando pelo embedder `fake`
- [ ] `npm run eval` com o modelo escolhido: ≥ 85% de acertos no total, ≥ 90% de "não encontrei" correto, nenhuma regressão no tipo `exata` e ganho visível em `parafrase`
- [ ] `npm run eval:busca -- medir` rodado com as perguntas reais do T3, com o modelo escolhido pelo usuário e registrado no ADR-0012
- [ ] Demonstração com o chip seguindo o `onboarding.md`
- [ ] Re-extração reversa executada e sem regressão vermelha (recomendado, não obrigatório)

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-24 | Versão inicial gerada por `/reversa-plan` | reversa |
