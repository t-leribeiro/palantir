export type { IngestDecision, Source, SourceKind, SourceStatus } from "./domain/source.js";
export { decideIngestion } from "./domain/source.js";
export {
  createIsSourceAuthorized,
  type IsSourceAuthorized,
  type SourceRef,
  type SourceRepository,
} from "./application/is-source-authorized.js";
export { createPgSourceRepository } from "./infrastructure/pg-source-repository.js";
