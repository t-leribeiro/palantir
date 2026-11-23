export type { IngestDecision, Source, SourceKind, SourceStatus } from "./domain/source.js";
export { decideIngestion } from "./domain/source.js";
export {
  createIsSourceAuthorized,
  type IsSourceAuthorized,
  type SourceRef,
  type SourceRepository,
} from "./application/is-source-authorized.js";
export { createPgSourceRepository } from "./infrastructure/pg-source-repository.js";
export {
  IMPORT_PROVIDER,
  createEnsureImportSource,
  importConversationId,
  unlinkedAccountId,
  type EnsureImportSource,
  type ImportOwner,
  type ImportSourceRef,
  type ImportSourceRepository,
} from "./application/ensure-import-source.js";
export { createPgImportSourceRepository } from "./infrastructure/pg-import-source-repository.js";
export {
  CAPTURE_PROVIDER,
  CONSENT_MAX_LENGTH,
  CONSENT_MIN_LENGTH,
  createCaptureAdmin,
  createRouteGroup,
  createSyncGroupDirectory,
  resolveGroupRef,
  sortGroups,
  validateConsent,
  type AuthorizeCaptureInput,
  type AuthorizeCaptureResult,
  type CaptureAdmin,
  type CaptureAdminDeps,
  type CaptureRecord,
  type CaptureRepository,
  type CaptureRoute,
  type CaptureStatus,
  type DirectoryGroup,
  type GroupDirectory,
  type GroupListing,
  type GroupSnapshot,
} from "./application/capture-authorization.js";
export { createPgCaptureRepository } from "./infrastructure/pg-capture-repository.js";
export { createPgGroupDirectory } from "./infrastructure/pg-group-directory.js";
