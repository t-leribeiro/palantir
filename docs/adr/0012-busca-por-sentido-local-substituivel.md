# ADR-0012: Busca pelo sentido local e substituível, combinada com a busca por palavra, e verificador externo opcional

- Status: aceito
- Data: 2026-11-25
- Decisores: Leandro (produto), reversa-plan
- Origem: `_reversa_forward/007-achar-assunto-outras-palavras/roadmap.md` (D-01 a D-17) e o esclarecimento de 2026-11-24

## Contexto

Até a S5, a busca só achava mensagens que tinham as palavras da pergunta (S0). Uma pergunta com sinônimo, paráfrase ou erro de digitação voltava "não encontrei", mesmo com a resposta na base. As specs `knowledge-indexing` e `retrieval` preveem a busca híbrida: palavra exata, palavra aproximada e sentido, com o isolamento por espaço antes da busca. O PRD pede o cálculo local por padrão.

A Anthropic não oferece modelo de embeddings; a documentação dela indica a Voyage AI. A máquina do usuário não tem placa de vídeo, e o transcritor da S4 já usa até 4 GB.

## Decisão

1. **Cálculo do sentido atrás da porta `Embedder`** (módulo `knowledge`), substituível por configuração:
   - `openai-compatible`: qualquer `POST /v1/embeddings`. Hoje é o motor local; amanhã pode ser a OpenAI;
   - `voyage`: o fornecedor indicado pela Anthropic;
   - `fake`: para os testes.

   A regra `embedder-engine-isolated` impede que o núcleo conheça o motor.
2. **Motor local: Text Embeddings Inference em CPU** (`cpu-1.9.4`, módulo Terraform `embedder`, `127.0.0.1:8091`). Ele serve um modelo por container, e o `npm run setup` passa o modelo do `.env`.
   - O Ollama foi avaliado primeiro, mas a imagem tem 3,4 GB compactada, contra 0,24 GB do TEI.
   - O Speaches não calcula embeddings.
3. **Serviço online só com liberação explícita** (`PALANTIR_EMBEDDER_ALLOW_REMOTE=true`). Com ele ligado, todas as mensagens indexadas e as perguntas vão para o fornecedor. Usar com dados reais exige um ADR próprio sobre o envio de dados de terceiros.
4. **Vetores fora do trecho**:
   - a tabela `chunk_embeddings` guarda os vetores, e `embedding_models` registra os modelos, com um ativo e um em construção, no máximo;
   - o índice HNSW de cada modelo é parcial, com cast para a dimensão dele (até 2.000);
   - dois modelos convivem durante uma troca;
   - a cascata vem do trecho, então apagar uma fonte (S5) leva os vetores.
5. **Cálculo junto da indexação e varredura**:
   - o job `knowledge.index` calcula o sentido logo depois de gravar os trechos, e uma falha não para a indexação por palavra;
   - uma varredura a cada 30 s completa os pendentes, das mensagens mais recentes para as mais antigas, e troca de modelo quando o novo fica completo.
6. **Busca combinada**:
   - três consultas: palavra, palavra parecida (trigramas) e sentido (cosseno);
   - cada uma tem os filtros de espaço, tipo, fonte e exclusão dentro dela;
   - a fusão é por posição (RRF, k = 60).
7. **"Não encontrei" por sinais absolutos**: só é citado o que passa no próprio sinal, contra os limiares:
   - fração de termos, para a palavra e a palavra parecida;
   - semelhança de sentido do modelo ativo.

   O limiar de sentido vem da medição (`npm run eval:busca`).
8. **Verificador externo opcional** (porta `EvidenceVerifier`, adaptador do Jev, da TypeSafe):
   - fica desligado por padrão e liga com `PALANTIR_VERIFIER_ALLOW_REMOTE=true`;
   - uma requisição por pergunta, com uma pergunta "noul" por candidata (até 30);
   - cita as candidatas com p ≥ 0,7;
   - fora do ar, a decisão por sinais vale e a busca marca `degraded`.
9. **Medição e eval**:
   - o `npm run eval` compara a busca só por palavra (a linha de base da S5) com a combinada, por tipo de pergunta;
   - o `npm run eval:busca` mede cada modelo candidato num container temporário, com o conjunto sintético e com as perguntas reais em `exports/`, e mostra só números.

**Modelo escolhido:** registrado aqui depois da medição com as perguntas reais do T3.

## Consequências

- **Positivas:**
  - perguntas com outras palavras ou com erro de digitação acham a mensagem, em texto e em áudio transcrito;
  - trocar de modelo, de motor ou de fornecedor é configuração;
  - o motor fora do ar só degrada a busca para "por palavra".
- **Negativas e riscos:**
  - o cálculo do histórico disputa a CPU com a transcrição;
  - o motor local usa mais memória do que o previsto: o `multilingual-e5-small` mediu 3,6 GB no container de medição, e o limite do container é de 3 GB, ajustável;
  - a busca por palavra parecida também aproxima palavras comuns. Por exemplo, "recomendou" acha "recomendo", e uma pergunta sem resposta pode passar. Ela pode ser desligada com `PALANTIR_TYPO_SEARCH=off`;
  - numa troca entre dois modelos locais, o motor só serve o novo, então a busca por sentido fica degradada até o novo ficar completo.

## Alternativas consideradas

- **Embeddings dentro do worker (ONNX):** dependência nativa pesada no processo, sem limite de CPU.
- **Ollama:** troca de modelo sem reiniciar, mas a imagem tem 3,4 GB.
- **Coluna `embedding vector(n)` em `message_chunks`, como na spec:** impede a convivência de dois modelos durante a troca.
- **Limiar sobre o score do RRF:** o RRF só ordena e não diz se a melhor candidata é boa.
- **Jev como busca:** ele só julga candidatas que outra busca já trouxe.
- **Claude reescrevendo a pergunta:** adiado. O Claude entra na S9, recebendo só os trechos encontrados.

## Quando revisar

- Antes de ligar o serviço online ou o verificador com dados reais (ADR de dados de terceiros).
- Se o Recall@10 nas perguntas reais ficar abaixo de 90%: reordenação local (`retrieval` OQ-02).
- Se aparecerem mensagens longas o bastante para pedir a divisão em vários trechos.
