# Interface: porta `Embedder` (local e online) e a varredura `knowledge.embed.sweep`

> Feature: `007-achar-assunto-outras-palavras` · Decisões D-01 a D-06, D-09, D-11

## 1. Porta (núcleo)

```ts
type EmbedPurpose = "document" | "query";

interface Embedder {
  readonly provider: string;     // "openai-compatible" | "voyage" | "fake"
  readonly model: string;
  readonly dimensions: number;
  embed(texts: readonly string[], purpose: EmbedPurpose, signal?: AbortSignal): Promise<number[][]>;
  health(): Promise<boolean>;
}
```

- Os vetores são normalizados (norma 1) pelo adaptador, para o cosseno ser comparável entre fornecedores.
- Cada vetor tem exatamente `dimensions` posições. Outra quantidade gera `EmbedderError("dimension_mismatch")`, e nada é gravado (EC-05).
- Erros: `EmbedderError` com `reason` = `unavailable`, `timeout`, `rate_limited`, `rejected` ou `dimension_mismatch`. O núcleo nunca vê erro do fornecedor.
- Nenhum adaptador registra em log o texto enviado nem o vetor recebido.

## 2. Adaptador `openai-compatible`

Serve para o Ollama local (padrão) e para qualquer serviço online com a API de embeddings da OpenAI.

```
POST {PALANTIR_EMBEDDER_URL}/v1/embeddings
Authorization: Bearer {PALANTIR_EMBEDDER_API_KEY}     (só se houver chave)
Content-Type: application/json

{ "model": "{PALANTIR_EMBEDDER_MODEL}",
  "input": ["{prefixo}{texto 1}", "{prefixo}{texto 2}", ...],
  "dimensions": {PALANTIR_EMBEDDER_DIMENSIONS} }       (só se o fornecedor aceitar; configurável)

200 → { "data": [ { "index": 0, "embedding": [ ... ] }, ... ] }
```

| Situação | Tratamento |
|----------|------------|
| 200 | O resultado é ordenado por `index` e normalizado |
| 429 | `rate_limited`; a varredura espera o próximo ciclo |
| 5xx, recusa de conexão | `unavailable` |
| Prazo estourado | `timeout`: 10 s para lotes de trechos, 1,5 s para a pergunta (D-09) |
| 400, 401, 404 | `rejected`, com log sem conteúdo (modelo inexistente, chave errada) |

**Saúde:** `GET {URL}/v1/models` com um prazo de 5 s.

**Lote:** até 32 textos por chamada. No local, uma chamada por vez (concorrência 1).

## 3. Adaptador `voyage`

```
POST {PALANTIR_EMBEDDER_URL, padrão https://ai.mongodb.com}/v1/embeddings
Authorization: Bearer {PALANTIR_EMBEDDER_API_KEY}

{ "model": "voyage-4", "input": [...], "input_type": "document" | "query", "output_dimension": 1024 }
```

- `input_type` vem do `purpose`, e os prefixos ficam vazios.
- `output_dimension` usa o `PALANTIR_EMBEDDER_DIMENSIONS` (até 2.000).
- Exige `PALANTIR_EMBEDDER_ALLOW_REMOTE=true`.

## 4. Adaptador `fake` (testes)

- Determinístico e sem rede. Cada palavra normalizada vai para o eixo do seu "conceito" num léxico de fixture (`test/support/embedding-concepts.ts`); palavras fora do léxico vão para um eixo derivado do hash.
- O vetor é a soma normalizada. Assim "baratear" e "reduzir o custo" ficam próximos nos cenários de aceite.
- Liga com `PALANTIR_EMBEDDER=fake`, permitido só nos testes e no `eval` da esteira, nunca em `NODE_ENV=production`.

## 5. Cálculo junto da indexação

No job `knowledge.index`, depois de `replaceChunks`:

1. Se `PALANTIR_EMBEDDER=off`, termina.
2. Calcula o sentido dos trechos da mensagem com o modelo ativo, e com o modelo em construção, se houver (prazo de 10 s).
3. Grava em `chunk_embeddings`, com `ON CONFLICT DO NOTHING`.
4. Em qualquer erro do embedder, registra a métrica `embedding_items_total{outcome="deferred"}` e termina. O job continua `completed`, e o trecho fica pendente para a varredura.

## 6. Fila `knowledge.embed.sweep`

| Opção | Valor |
|-------|-------|
| Agendamento | pg-boss `schedule`, a cada 30 s (expressão cron com segundos ou um job recorrente com `singletonKey` fixo) |
| Concorrência | 1 (um worker processa) |
| Payload | `{}` |
| `expireInSeconds` | 60 |
| Retentativa | Nenhuma: o próximo ciclo retoma |

**Passos de cada ciclo, com no máximo 25 s:**
1. Carregar os modelos `active` e `building`.
2. Para cada modelo, selecionar até 32 trechos sem vetor, das mensagens mais recentes para as mais antigas (`ORDER BY m.sent_at DESC, c.id`), com `FOR UPDATE SKIP LOCKED` numa transação curta.
3. Calcular o sentido e gravar. Repetir enquanto houver tempo e pendentes.
4. Se o modelo `building` ficou sem pendentes, ativá-lo numa transação: o anterior vira `retired`, o novo vira `active`, e o índice HNSW é criado (D-06).
5. Se houver `retired` com vetores, apagar até 5.000 vetores por ciclo. Com os vetores zerados, remover o índice dele.
6. Atualizar o gauge `embedding_pending`.

**Erros:**
- Embedder fora do ar: o ciclo termina sem erro, o gauge fica parado, e `EmbedderDown` e `EmbeddingBacklogStalled` avisam.
- Banco fora do ar: o job falha, e o próximo ciclo tenta de novo.

**Idempotência:** a PK (`chunk_id`, `model_id`) com `ON CONFLICT DO NOTHING`. Ativar duas vezes não tem efeito, porque o índice único parcial protege.

## 7. Registro do modelo configurado

Na subida do worker, a configuração vira um registro em `embedding_models`. A chave é provider + model + base_url + dimensions + prefixos.
- Se não há modelo ativo, ele nasce `active` (primeiro modelo).
- Se há um ativo diferente, ele nasce `building`, e a subida registra em log que a troca começou.
- Se já existe e está `retired`, volta a `building`: os vetores antigos podem ter sido apagados.

O limiar (`min_similarity`) vem de `PALANTIR_SEMANTIC_MIN_SIMILARITY`. Sem ele, o padrão é 0,5 e a subida avisa que o limiar não foi calibrado.

## 8. Pergunta (lado da busca)

- A pergunta é calculada com `purpose: "query"`, o modelo ativo e o prazo de 1,5 s.
- Falha: a busca roda sem a estratégia de sentido e devolve `degraded: true`, com `search_degraded_total{reason="embedder"}`.

> Execução (2026-11-25):
> - O motor local é o Text Embeddings Inference `cpu-1.9.4` em `127.0.0.1:8091`, não o Ollama (imagem de 3,4 GB). A saúde é conferida em `GET /v1/models`, e o `doctor` usa `GET /info`.
> - O adaptador confere o `model` da resposta: um modelo diferente do configurado dá `model_mismatch`.
> - A varredura roda num `setInterval` de 30 s no worker, um ciclo por vez, sem fila agendada, e a seleção dos pendentes dispensa `SKIP LOCKED`.
