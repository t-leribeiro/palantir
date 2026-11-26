export {
  MAX_INDEXED_CHARS,
  createIndexMessage,
  type Chunk,
  type ChunkRepository,
  type IndexMessage,
  type IndexOutcome,
  type IndexRequest,
  type IndexableMessage,
} from "./application/index-message.js";
export { BLOCK_MAX_CHARS, transcriptBlocks, type TranscriptBlock, type TranscriptSegment } from "./domain/transcript-chunks.js";
export { createPgChunkRepository } from "./infrastructure/pg-chunk-repository.js";
export { EmbedderError, checkVectors, type EmbedPurpose, type Embedder, type EmbedderFailure } from "./application/embedder.js";
export { cosine, normalize } from "./domain/vector.js";
export { FAKE_EMBEDDER_PROVIDER, createFakeEmbedder, type ConceptLexicon, type FakeEmbedderOptions } from "./infrastructure/embedders/fake.js";
export { MAX_BATCH, OPENAI_COMPATIBLE_EMBEDDER, createOpenAiCompatibleEmbedder, type OpenAiCompatibleEmbedderOptions } from "./infrastructure/embedders/openai-compatible.js";
export { VOYAGE_EMBEDDER, createVoyageEmbedder, type VoyageEmbedderOptions } from "./infrastructure/embedders/voyage.js";
export { type ChunkText, type ChunkVector, type EmbeddingStore, type EnsureOutcome, type ModelSpec, type ModelStatus, type RegisteredModel } from "./application/embedding-store.js";
export { createPgEmbeddingRepository, vectorIndexOf } from "./infrastructure/pg-embedding-repository.js";
export { NOOP_EMBEDDING_OBSERVER, createEmbedMessageChunks, embedBatch, type EmbedDeps, type EmbedItemsOutcome, type EmbedMessageChunks, type EmbedMessageOutcome, type EmbeddingObserver } from "./application/embed-chunks.js";
export { createSweepEmbeddings, type SweepEmbeddings, type SweepOptions, type SweepResult } from "./application/sweep-embeddings.js";
export { createActiveModelQueryEmbedding, type ActiveQueryVector, type QueryEmbeddingOptions } from "./application/query-embedding.js";
export { createOtelEmbeddingObserver, type OtelEmbeddingObserver } from "./infrastructure/otel-embedding-observer.js";
export { THEME_MAX_CHARS, UNTITLED_THEME, normalizeTheme, parseTheme, type Theme, type ThemeProblem } from "./domain/theme.js";
export {
  InvalidThemeError,
  LISTING_LIMIT,
  THEMES_LIMIT,
  createSavedItems,
  type ForgetResult,
  type SavedContent,
  type SavedEntry,
  type SavedItemStore,
  type SavedItems,
  type SavedMessage,
  type SavedOrigin,
  type ThemeCount,
  type ThemeListing,
} from "./application/saved-items.js";
export { createPgSavedItems, type OrphanKeysHook } from "./infrastructure/pg-saved-items.js";
