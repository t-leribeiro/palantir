export type { IngestDecision, Source, SourceKind, SourceStatus } from "./domain/source.js";
export { DELETION_NOTICE_QUEUE, SOURCE_DELETE_QUEUE, type SourceDeleteJob } from "./domain/deletion.js";
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
export {
  assertCountsOnly,
  type AuditAction,
  type AuditChannel,
  type AuditEntry,
  type AuditEvent,
  type AuditLog,
  type AuditTargetKind,
} from "./application/audit.js";
export { createPgAuditLog, insertAuditEvent } from "./infrastructure/pg-audit-log.js";
export {
  consentStatement,
  createSourceManagement,
  type DeletionTarget,
  type FollowCheck,
  type ManagedItem,
  type ManagedState,
  type SourceManagement,
  type SourceManagementDeps,
  type SpaceSource,
  type SpaceSourceRepository,
  type StopResult,
} from "./application/source-management.js";
export { createPgSpaceSourceRepository } from "./infrastructure/pg-space-source-repository.js";
export {
  createRequestSourceDeletion,
  type DeletionRecord,
  type DeletionRequest,
  type DeletionStore,
  type RequestDeletionResult,
  type RequestSourceDeletion,
} from "./application/request-deletion.js";
export { createExecuteSourceDeletion, type ExecuteSourceDeletion, type MediaPurger } from "./application/execute-deletion.js";
export { createPgDeletionStore } from "./infrastructure/pg-deletion-store.js";
