export { RECONCILE_WINDOW_MS, normalizeForMatch, type ReconcileDirection } from "./domain/reconcile.js";
export {
  toNewMessage,
  type AttachmentKind,
  type CaptureMethod,
  type IngestTarget,
  type MessageKind,
  type NewAttachment,
  type NewMessage,
} from "./domain/message.js";
export type {
  IndexJob,
  IndexJobs,
  IngestionTx,
  InsertResult,
  MediaJob,
  MessageStore,
  ReconcileRow,
  SourceAuthorization,
  SourceCheck,
  UnitOfWork,
} from "./application/ports.js";
export { LIVE_PRIORITY, createIngestMessage, type IngestMessage, type IngestMessageDeps } from "./application/ingest-message.js";
export { createPgMessageStore } from "./infrastructure/pg-message-store.js";
export {
  INDEX_QUEUE,
  createPgUnitOfWork,
  mediaJobExpireSeconds,
  type MediaJobsOptions,
} from "./infrastructure/pg-unit-of-work.js";
