# Investigation: Achar o mesmo assunto dito com outras palavras (fatia S6)

> Identificador: `007-achar-assunto-outras-palavras`
> Data: `2026-11-24`

## 1. O que existe hoje

- **Busca:** só textual, desde a S0 (`src/modules/retrieval/infrastructure/pg-search-index.ts`).
  - Cada termo da pergunta entra como OU. O score é a fração dos termos presentes e o `ts_rank` desempata.
  - O limiar de baixa confiança é 0,5 (`PALANTIR_LOW_CONFIDENCE_THRESHOLD`).
  - Com perguntas de dois termos, basta um termo para responder. É isso que faz a pergunta n07 ("Alguém testou o Cassandra?") responder quando não devia.
- **Indexação** (`src/modules/knowledge/application/index-message.ts`): um trecho por mensagem e blocos de ~400 caracteres para a transcrição. O comentário do arquivo já previa os embeddings para "uma feature seguinte".
- **Extensões:** `vector`, `pg_trgm` e `unaccent` estão instaladas desde a `0001`, sem uso além do `unaccent` no `palantir_pt`.
- **Eval** (`eval/cases.json`): 20 mensagens e 32 perguntas sintéticas. As 24 com resposta usam as mesmas palavras da mensagem. Última medição: 96,9% de acertos e 87,5% de "não encontrei" correto. O eval não roda na esteira.
- **Padrão do motor plugável:** a porta `Transcriber` com o adaptador `openai-compatible`, motor num container do Terraform (`infra/modules/transcriber`) e `ALLOW_REMOTE` na configuração (S4, ADR-0010). A S6 repete esse padrão.

## 2. Onde calcular o sentido

| Opção | Prós | Contras | Veredito |
|-------|------|---------|----------|
| Speaches (já no ar) | Nenhum container novo | O `openapi.json` do Speaches 0.8.3, consultado em 2026-11-24, não tem `/v1/embeddings` (só áudio, chat e modelos) | Descartado |
| Ollama em container | API `/v1/embeddings` compatível com a da OpenAI; troca de modelo por nome, sem reiniciar; modelos quantizados (GGUF) com pouca memória; `keep_alive: 0` descarrega o modelo | Imagem grande (inclui bibliotecas de GPU); os nomes dos modelos seguem o catálogo dele | **Escolhido** (D-02), com a imagem medida na ação |
| Text Embeddings Inference (CPU) | Imagem de CPU dedicada; desempenho bom em modelos BERT e similares | Um modelo por container: medir vários exige reiniciar | Alternativa, se a imagem do Ollama pesar demais |
| ONNX no próprio worker | Nenhum container | Dependência nativa no processo do worker, CPU sem limite e disputa com a indexação | Descartado |
| Serviço online (OpenAI, Voyage) | Qualidade alta, nada de CPU local | Toda a base sai da máquina (dados de terceiros); custo por token | Disponível por configuração (RF-13), desligado por padrão |

**Anthropic e embeddings:** a documentação da Anthropic (`https://platform.claude.com/docs/en/build-with-claude/embeddings`, lida em 2026-11-24) diz que ela não oferece modelo de embeddings e indica a Voyage AI, da MongoDB. Os modelos atuais da Voyage são `voyage-4-large`, `voyage-4` e `voyage-4-lite` (1024 dimensões por padrão; 256, 512 e 2048 opcionais). O parâmetro `input_type` (`query` ou `document`) é recomendado. A Voyage também publica `voyage-4-nano` com pesos abertos (Apache 2.0) no Hugging Face. A API fica em `https://ai.mongodb.com/v1/embeddings`.

## 3. Modelos candidatos para a medição local

Os candidatos são multilingues e cabem em 2 GB de memória quantizados. A ação confere os nomes no catálogo do motor antes de baixar:
- `bge-m3`: multilingue, 1024 dimensões, sem prefixo;
- `qwen3-embedding:0.6b`: multilingue, 1024 dimensões, com instrução na pergunta;
- `embeddinggemma`: multilingue, 768 dimensões, pequeno;
- `snowflake-arctic-embed2`: multilingue, 1024 dimensões;
- `paraphrase-multilingual`: 768 dimensões, antigo, mas feito para paráfrase. Serve de linha de base barata;
- `voyage-4-nano`: só se houver build para o motor escolhido. Seria a ponte natural para a Voyage online.

A escolha é do usuário, com a tabela do `eval:busca`, como foi com o Whisper na S4.

## 4. Busca combinada

- **RRF** (Reciprocal Rank Fusion, k = 60): é o que a spec `retrieval` pede (RF-03). Dispensa calibrar escalas diferentes. A pontuação de cada mensagem é Σ 1/(k + posição) nas estratégias em que ela aparece.
- **O RRF só ordena:** não diz se a primeira candidata é boa. Por isso o "não encontrei" usa os sinais absolutos de cada estratégia (D-08).
- **pgvector:**
  - o operador `<=>` dá a distância de cosseno;
  - o HNSW do tipo `vector` aceita até 2.000 dimensões e exige dimensão fixa;
  - um índice parcial com expressão de cast, como `((embedding::vector(1024))) WHERE model_id = ...`, permite vários modelos na mesma coluna. A consulta precisa repetir o cast e o filtro.
- **pg_trgm:** `word_similarity` e o operador `<%` comparam um termo com a palavra mais parecida do texto, com índice GIN `gin_trgm_ops`. O `unaccent` padrão não é imutável. Um wrapper SQL imutável com o dicionário explícito é o caminho usual para colunas geradas e índices.

## 5. Verificador externo (Jev, TypeSafe)

Fatos da documentação (`https://docs.typesafe.ai`, lida em 2026-11-24, páginas `system-one`, `rerank_typesafe`, `api`, `models`, `confidence`, `noul`, `companion-noul` e `legal`):
- O Jev devolve julgamentos tipados: Choice, Score, Noul (probabilidade de "sim") e Box. Ele não gera texto e não tem endpoint de embeddings.
- A receita de reordenação faz uma requisição por par (pergunta, candidata) com uma Noul, depois de uma busca de primeira etapa (BM25, top 30). Ela não acha o que a primeira etapa perdeu.
- Ele roda só na nuvem (`https://api.typesafe.ai`, `POST /v1/systemone`). A documentação não fala em instalação local.
- Ele não é treinado com as requisições dos clientes. A retenção zero existe para enterprise, sob pedido. Há DPA e política de privacidade, não lidos. A documentação não fala de LGPD nem de região.
- A documentação não fala de idiomas: todos os exemplos são em inglês.
- O preço é de US$ 0,042 por milhão de tokens de entrada, com a saída grátis. O contexto é de 64 mil tokens por requisição.
- Limiares de partida da documentação: Noul > 0,7 é sim, < 0,3 é não, e o meio vai para uma pessoa. Calibre com os seus dados.

Conclusão: o Jev serve como segunda etapa opcional (reordenar e decidir o "não encontrei"), não como busca. Ele fica atrás da porta `EvidenceVerifier`, desligado por padrão, e é medido no eval (D-10).

## 6. Ferramentas de LLM (Langfuse, OpenRouter)

Avaliadas em 2026-11-24 e adiadas para a S9: a S6 não tem LLM. A indicação ficou registrada em `docs/plano-de-fatias.md`, na linha da S9.

## 7. Lições das fatias anteriores aplicadas aqui

- Na medição, um modelo por vez, descarregando o anterior (S4: o motor acumulava modelos e distorcia tempo e memória).
- Saída só com números. Os dados reais ficam em `exports/` (S1 e S4).
- O `onboarding.md` é autossuficiente (lição da S2).
- Um só worker sem `--watch` durante a fatia (a fila de transcrição do T3 segue em segundo plano).
