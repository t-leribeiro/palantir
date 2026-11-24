// API pública do módulo media (feature 005).
export { InvalidOggError, looksLikeOgg, oggOpusDuration } from "./domain/ogg-duration.js";
export {
  MAX_ATTACHMENT_BYTES,
  MAX_AUDIO_SECONDS,
  MEDIA_KINDS,
  createMediaPolicy,
  isOggMime,
  mediaKindOfFileName,
  mediaKindOfMime,
  mimeOfFileName,
  type MediaKind,
  type MediaPolicy,
} from "./domain/media-policy.js";
export { aggregateWer, normalizeForWer, werCount, type WerCount } from "./domain/wer.js";
export {
  TranscriberError,
  type AttachmentForProcessing,
  type MediaProcessor,
  type MediaTx,
  type MediaUnitOfWork,
  type ObjectStore,
  type ProcessingError,
  type ProcessingStatus,
  type ProcessorResult,
  type TranscribeInput,
  type TranscribeResult,
  type Transcriber,
  type TranscriberErrorKind,
  type TranscriptSegment,
} from "./application/ports.js";
export { EnvelopeError, isSealed } from "./infrastructure/object-store/envelope.js";
export { createS3ObjectStore, type S3ObjectStore, type S3ObjectStoreOptions } from "./infrastructure/object-store/s3-object-store.js";
export { FAKE_ENGINE, createFakeTranscriber, type FakeTranscriberOptions } from "./infrastructure/transcribers/fake.js";
export {
  OPENAI_COMPATIBLE_ENGINE,
  createOpenAiCompatibleTranscriber,
  type OpenAiCompatibleOptions,
} from "./infrastructure/transcribers/openai-compatible.js";
export {
  createPrepareAttachments,
  type MediaFetch,
  type PrepareAttachments,
  type PrepareAttachmentsDeps,
  type SourceLookup,
} from "./application/prepare-attachments.js";
export {
  MEDIA_QUEUE,
  NOOP_MEDIA_OBSERVER,
  createAudioProcessor,
  createProcessAttachment,
  type MediaObserver,
  type ProcessAttachment,
  type ProcessAttachmentDeps,
  type ProcessJob,
  type ProcessOutcome,
} from "./application/process-attachment.js";
export {
  createPgMediaUnitOfWork,
  sweepPendingMedia,
  type PgMediaUnitOfWorkOptions,
  type SweepPendingOptions,
} from "./infrastructure/pg-media-repository.js";
