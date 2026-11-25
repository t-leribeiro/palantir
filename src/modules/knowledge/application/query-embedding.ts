// Sentido da pergunta no modelo ativo (feature 007, D-06; interfaces/embedder-e-varredura.md §8). Durante uma troca,
// a pergunta continua com o modelo ativo até o novo ficar completo. O modelo ativo fica em cache por pouco tempo
// para não consultar o registro a cada pergunta.
import type { Embedder } from "./embedder.js";
import type { EmbeddingStore, RegisteredModel } from "./embedding-store.js";

export interface ActiveQueryVector {
  readonly vector: readonly number[];
  readonly modelId: string;
  readonly dimensions: number;
  readonly minSimilarity: number;
}

export interface QueryEmbeddingOptions {
  readonly cacheMs?: number;
  readonly now?: () => number;
}

export function createActiveModelQueryEmbedding(
  deps: { readonly store: EmbeddingStore; readonly embedderFor: (model: RegisteredModel) => Embedder | undefined },
  options: QueryEmbeddingOptions = {},
): { embedQuery(text: string, signal: AbortSignal): Promise<ActiveQueryVector | null> } {
  const cacheMs = options.cacheMs ?? 30_000;
  const now = options.now ?? Date.now;
  let cached: { model: RegisteredModel | null; at: number } | undefined;

  async function active(): Promise<RegisteredModel | null> {
    if (!cached || now() - cached.at > cacheMs) cached = { model: await deps.store.activeModel(), at: now() };
    return cached.model;
  }

  return {
    async embedQuery(text, signal) {
      const model = await active();
      if (!model) return null;
      const embedder = deps.embedderFor(model);
      if (!embedder) return null;
      const [vector] = await embedder.embed([text], "query", signal);
      return { vector: vector ?? [], modelId: model.id, dimensions: model.dimensions, minSimilarity: model.minSimilarity };
    },
  };
}
