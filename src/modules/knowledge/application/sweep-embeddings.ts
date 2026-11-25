// Varredura dos trechos sem vetor (feature 007, D-05, D-06; interfaces/embedder-e-varredura.md §6): a cada ciclo,
// em lotes e dentro de um prazo, calcula o que falta para o modelo ativo e para o em construção. Quando o em
// construção fica completo, troca de modelo; depois limpa os vetores aposentados. Cobre a falha da hora da
// indexação, o histórico guardado antes da S6 e a troca de modelo.
import { EmbedderError } from "./embedder.js";
import { NOOP_EMBEDDING_OBSERVER, embedBatch, type EmbedDeps } from "./embed-chunks.js";
import type { RegisteredModel } from "./embedding-store.js";

export interface SweepOptions {
  readonly batchSize?: number;
  /** Prazo do ciclo; o próximo ciclo continua de onde parou. */
  readonly budgetMs?: number;
  readonly purgeLimit?: number;
  readonly now?: () => number;
}

export interface SweepResult {
  readonly embedded: number;
  readonly activated: boolean;
  readonly purged: number;
  readonly pending: number;
  /** O motor falhou num lote (fora do ar ou prazo estourado): o ciclo parou e o próximo tenta de novo. */
  readonly deferred: boolean;
}

export type SweepEmbeddings = () => Promise<SweepResult>;

const DEFAULTS = { batchSize: 32, budgetMs: 25_000, purgeLimit: 5_000 };

export function createSweepEmbeddings(deps: EmbedDeps, options: SweepOptions = {}): SweepEmbeddings {
  const { batchSize, budgetMs, purgeLimit } = { ...DEFAULTS, ...options };
  const now = options.now ?? Date.now;
  const observer = deps.observer ?? NOOP_EMBEDDING_OBSERVER;

  /** Calcula os pendentes do modelo até acabar, até o prazo ou até o motor falhar. */
  async function fill(model: RegisteredModel, deadline: number): Promise<{ embedded: number; deferred: boolean }> {
    const embedder = deps.embedderFor(model);
    if (!embedder) return { embedded: 0, deferred: false };
    let embedded = 0;
    while (now() < deadline) {
      const chunks = await deps.store.pendingChunks(model.id, batchSize);
      if (chunks.length === 0) break;
      try {
        embedded += await embedBatch(deps, model, embedder, chunks);
      } catch (error) {
        if (!(error instanceof EmbedderError)) throw error;
        observer.items("deferred", chunks.length);
        return { embedded, deferred: true };
      }
    }
    return { embedded, deferred: false };
  }

  async function completeSwap(model: RegisteredModel): Promise<boolean> {
    if (model.status !== "building" || (await deps.store.pendingCount(model.id)) > 0) return false;
    await deps.store.activate(model.id);
    observer.activated();
    return true;
  }

  return async () => {
    const deadline = now() + budgetMs;
    let embedded = 0;
    let activated = false;
    let deferred = false;
    for (const model of await deps.store.targets()) {
      const filled = await fill(model, deadline);
      embedded += filled.embedded;
      deferred = deferred || filled.deferred;
      activated = (await completeSwap(model)) || activated;
    }
    const purged = await deps.store.purgeRetired(purgeLimit);
    const active = await deps.store.activeModel();
    const pending = active ? await deps.store.pendingCount(active.id) : 0;
    observer.pending(pending);
    return { embedded, activated, purged, pending, deferred };
  };
}
