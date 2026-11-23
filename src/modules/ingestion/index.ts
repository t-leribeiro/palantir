export { toNewMessage, type CaptureMethod, type IngestTarget, type MessageKind, type NewMessage } from "./domain/message.js";
export type {
  IndexJob,
  IndexJobs,
  IngestionTx,
  InsertResult,
  MessageStore,
  SourceAuthorization,
  SourceCheck,
  UnitOfWork,
} from "./application/ports.js";
export { createIngestMessage, type IngestMessage, type IngestMessageDeps } from "./application/ingest-message.js";
export { createPgMessageStore } from "./infrastructure/pg-message-store.js";
export { INDEX_QUEUE, createPgUnitOfWork } from "./infrastructure/pg-unit-of-work.js";
