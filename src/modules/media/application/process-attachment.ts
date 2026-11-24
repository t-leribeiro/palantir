// Processar um anexo (feature 005, interfaces/job-media-process.md, D-12, D-13): o worker escolhe o
// processador pelo tipo (hoje só áudio), grava a transcrição versionada e publica a indexação no outbox.
// Idempotente: job repetido ou anexo já processado não cria outra versão.
import { createHash } from "node:crypto";
import { MAX_AUDIO_SECONDS, type MediaKind } from "../domain/media-policy.js";
import {
  TranscriberError,
  type AttachmentForProcessing,
  type MediaProcessor,
  type MediaUnitOfWork,
  type ObjectStore,
  type ProcessingError,
  type ProcessorResult,
  type Transcriber,
} from "./ports.js";

/** Fila do processamento de mídia (interfaces/job-media-process.md). */
export const MEDIA_QUEUE = "media.process";

export type ProcessOutcome = "done" | "empty" | "too_long" | "failed" | "skipped";

export interface ProcessJob {
  readonly attachmentId: string;
  readonly spaceId: string;
}

export type ProcessAttachment = (job: ProcessJob, attempt: { readonly lastAttempt: boolean }) => Promise<ProcessOutcome>;

/** Ganchos de métricas (T020); nenhum recebe texto. */
export interface MediaObserver {
  processed(kind: MediaKind, outcome: Exclude<ProcessOutcome, "skipped">, details?: { readonly reason?: ProcessingError }): void;
  transcribed(details: { readonly model: string; readonly rtf: number | null; readonly latencySeconds: number | null }): void;
}

export const NOOP_MEDIA_OBSERVER: MediaObserver = { processed: () => undefined, transcribed: () => undefined };

export interface ProcessAttachmentDeps {
  readonly unitOfWork: MediaUnitOfWork;
  readonly store: ObjectStore;
  readonly processors: readonly MediaProcessor[];
  readonly observer?: MediaObserver;
  readonly now?: () => Date;
}

export function createProcessAttachment(deps: ProcessAttachmentDeps): ProcessAttachment {
  const processors = new Map(deps.processors.map((p) => [p.kind, p]));
  const observer = deps.observer ?? NOOP_MEDIA_OBSERVER;
  const now = deps.now ?? (() => new Date());

  async function finish(attachment: AttachmentForProcessing, outcome: "too_long" | "failed", reason?: ProcessingError): Promise<ProcessOutcome> {
    await deps.unitOfWork.run((tx) => tx.markStatus(attachment.id, outcome, reason));
    observer.processed(attachment.mediaKind, outcome, reason ? { reason } : {});
    return outcome;
  }

  async function save(attachment: AttachmentForProcessing, result: ProcessorResult): Promise<ProcessOutcome> {
    const saved = await deps.unitOfWork.run(async (tx) => {
      const current = await tx.lockAttachment(attachment.id);
      if (current?.processingStatus !== "pending") return false;
      await tx.saveTranscript(current, result);
      await tx.markStatus(current.id, result.status);
      if (result.status === "done") await tx.enqueueIndex({ messageId: current.messageId, spaceId: current.spaceId });
      return true;
    });
    if (!saved) return "skipped";
    observer.processed(attachment.mediaKind, result.status);
    observer.transcribed({ model: result.transcript.model, rtf: result.transcript.rtf, latencySeconds: latencyOf(attachment, now()) });
    return result.status;
  }

  async function run(attachment: AttachmentForProcessing, processor: MediaProcessor, lastAttempt: boolean): Promise<ProcessOutcome> {
    const bytes = await read(deps.store, attachment).catch(() => undefined);
    if (!bytes) return finish(attachment, "failed", "corrupted");
    try {
      return await save(attachment, await processor.process(attachment, bytes));
    } catch (error) {
      if (!(error instanceof TranscriberError)) throw error;
      if (error.kind === "corrupted" || lastAttempt) return finish(attachment, "failed", error.kind);
      throw error;
    }
  }

  return async (job, attempt) => {
    const attachment = await deps.unitOfWork.load(job.attachmentId);
    if (!isPendingIn(attachment, job.spaceId)) return "skipped";
    if ((attachment.durationSeconds ?? 0) > MAX_AUDIO_SECONDS) return finish(attachment, "too_long");
    const processor = processors.get(attachment.mediaKind);
    if (!processor || !attachment.storageKey) {
      await deps.unitOfWork.run((tx) => tx.markStatus(attachment.id, "not_applicable"));
      return "skipped";
    }
    return run(attachment, processor, attempt.lastAttempt);
  };
}

/** Existe, é deste espaço e ainda não foi processado (job repetido ou de outro espaço é ignorado). */
function isPendingIn(attachment: AttachmentForProcessing | null, spaceId: string): attachment is AttachmentForProcessing {
  return attachment !== null && attachment.spaceId === spaceId && attachment.processingStatus === "pending";
}

/**
 * Objeto ilegível (cifra adulterada, chave trocada, ausente) ou com hash diferente do registrado é corrompido:
 * não adianta tentar de novo. Devolve `undefined` nesses casos.
 */
async function read(store: ObjectStore, attachment: AttachmentForProcessing): Promise<Uint8Array | undefined> {
  if (!attachment.storageKey) return undefined;
  const bytes = await store.get(attachment.storageKey);
  const sha = createHash("sha256").update(bytes).digest("hex");
  return attachment.sha256 === null || sha === attachment.sha256 ? bytes : undefined;
}

function latencyOf(attachment: AttachmentForProcessing, now: Date): number | null {
  return attachment.createdAt ? Math.max(0, (now.getTime() - attachment.createdAt.getTime()) / 1000) : null;
}

/** Processador de áudio: transcreve pela porta `Transcriber` e mede o fator de tempo real. */
export function createAudioProcessor(
  transcriber: Transcriber,
  clock: () => number = () => performance.now(),
): MediaProcessor {
  return {
    kind: "audio",
    async process(attachment, bytes) {
      const started = clock();
      const transcript = await transcriber.transcribe({
        audio: bytes,
        mimeType: attachment.mimeType,
        language: "pt",
        ...(attachment.durationSeconds === null ? {} : { durationHint: attachment.durationSeconds }),
      });
      const elapsedSeconds = (clock() - started) / 1000;
      const duration = transcript.durationSeconds ?? attachment.durationSeconds;
      const rtf = duration && duration > 0 ? elapsedSeconds / duration : null;
      const empty = transcript.segments.length === 0 || transcript.text.trim() === "";
      return { status: empty ? "empty" : "done", transcript: { ...transcript, rtf } };
    },
  };
}
