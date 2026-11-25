export { bestPerMessage, isLowConfidence, type Evidence, type EvidenceSignals } from "./domain/evidence.js";
export { RRF_K, decideEvidence, fuseRankings, passes, type DecisionThresholds, type RankedList, type Strategy } from "./domain/fusion.js";
export {
  CANDIDATES_PER_STRATEGY,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  QUERY_EMBED_TIMEOUT_MS,
  VERIFIER_CANDIDATES,
  VERIFIER_TIMEOUT_MS,
  createSearchEvidence,
  type DegradedReason,
  type EvidenceVerifier,
  type QueryEmbedding,
  type QueryVector,
  type SearchDeps,
  type SearchEvidence,
  type SearchIndex,
  type SearchKind,
  type SearchObserver,
  type SearchRequest,
  type SearchResponse,
  type VerifierCandidate,
} from "./application/search-evidence.js";
export { createPgSearchIndex } from "./infrastructure/pg-search-index.js";
export { TYPESAFE_VERIFIER, createTypeSafeVerifier, systemOneBody, type TypeSafeVerifierOptions } from "./infrastructure/verifiers/typesafe.js";
export { createFakeVerifier } from "./infrastructure/verifiers/fake.js";
export { createOtelSearchObserver } from "./infrastructure/otel-search-observer.js";
