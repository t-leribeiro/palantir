// Cálculo do sentido dos trechos (feature 007, D-05; interfaces/embedder-e-varredura.md §5 e §6): logo depois da
// indexação e, para o que ficou pendente, na varredura. Uma falha do motor nunca para a indexação por palavra (RN-07):
// o trecho fica sem vetor e a varredura tenta de novo.
import { EmbedderError, type Embedder } from "./embedder.js";
import type { ChunkText, EmbeddingStore, RegisteredModel } from "./embedding-store.js";

export type EmbedItemsOutcome = "embedded" | "deferred";

/** Métricas do cálculo (D-14), sem texto: só contagens, duração e o motivo da falha. */
export interface EmbeddingObserver {
  items(outcome: EmbedItemsOutcome, count: number, seconds?: number): void;
  pending(count: number): void;
  activated(): void;
}

export const NOOP_EMBEDDING_OBSERVER: EmbeddingObserver = { items: () => undefined, pending: () => undefined, activated: () => undefined };

export interface EmbedDeps {
  readonly store: EmbeddingStore;
  /** O adaptador que calcula com este modelo, ou `undefined` se a configuração atual não o alcança. */
  readonly embedderFor: (model: RegisteredModel) => Embedder | undefined;
  readonly observer?: EmbeddingObserver;
}

/** Calcula e grava os vetores de um lote; devolve quantos gravou, ou lança `EmbedderError`. */
export async function embedBatch(deps: EmbedDeps, model: RegisteredModel, embedder: Embedder, chunks: readonly ChunkText[]): Promise<number> {
  const started = performance.now();
  const vectors = await embedder.embed(chunks.map((c) => c.text), "document");
  await deps.store.save(
    model.id,
    chunks.map((c, i) => ({ chunkId: c.chunkId, spaceId: c.spaceId, vector: vectors[i] ?? [] })),
  );
  (deps.observer ?? NOOP_EMBEDDING_OBSERVER).items("embedded", chunks.length, (performance.now() - started) / 1000);
  return chunks.length;
}

export type EmbedMessageOutcome = "embedded" | "deferred" | "skipped";
export type EmbedMessageChunks = (messageId: string) => Promise<EmbedMessageOutcome>;

export function createEmbedMessageChunks(deps: EmbedDeps): EmbedMessageChunks {
  const observer = deps.observer ?? NOOP_EMBEDDING_OBSERVER;
  return async (messageId) => {
    const targets = await deps.store.targets();
    if (targets.length === 0) return "skipped";
    const chunks = await deps.store.chunksOfMessage(messageId);
    if (chunks.length === 0) return "skipped";
    let outcome: EmbedMessageOutcome = "embedded";
    for (const model of targets) {
      const embedder = deps.embedderFor(model);
      if (!embedder) continue;
      try {
        await embedBatch(deps, model, embedder, chunks);
      } catch (error) {
        if (!(error instanceof EmbedderError)) throw error;
        observer.items("deferred", chunks.length);
        outcome = "deferred";
      }
    }
    return outcome;
  };
}
