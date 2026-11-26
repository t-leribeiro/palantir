// Composição da mídia (feature 005): armazenamento cifrado, preparação de anexos, motor de transcrição e
// fila de processamento. Só src/main liga as portas às implementações (ADR-0001).
import type { CanonicalMessage, InboundHandler, KnowledgeChannel } from "../contracts/channel/knowledge-channel.js";
import {
  MEDIA_QUEUE,
  NOOP_MEDIA_OBSERVER,
  PURGE_OBJECT_QUEUE,
  createPurgeObject,
  type PurgeObjectJob,
  createAudioProcessor,
  createFakeTranscriber,
  createOpenAiCompatibleTranscriber,
  createPgMediaUnitOfWork,
  createPrepareAttachments,
  createProcessAttachment,
  createS3ObjectStore,
  mediaKindOfFileName,
  mimeOfFileName,
  type MediaKind,
  type MediaObserver,
  type PrepareAttachments,
  type ProcessAttachment,
  type ProcessJob,
  type S3ObjectStore,
  type Transcriber,
  sweepPendingMedia,
  type OtelMediaObserver,
  type PrepareObserver,
} from "../modules/media/index.js";
import { INDEX_QUEUE, LIVE_PRIORITY, mediaJobExpireSeconds, type MediaJobsOptions } from "../modules/ingestion/index.js";
import { createIsSourceAuthorized, createPgSourceRepository } from "../modules/sources/index.js";
import type { AppConfig, MediaConfig, TranscriptionConfig } from "../platform/config.js";
import type { Pool } from "../platform/db/index.js";
import type { Logger } from "../platform/logging/logger.js";
import type { JobQueue, QueueDefinition } from "../platform/queue/index.js";
import { withSpan } from "../platform/telemetry/index.js";

/** Tipos com processador nesta fatia (RN-10: outro tipo é só registrar o processador aqui). */
export const PROCESSED_KINDS: readonly MediaKind[] = ["audio"];

export const MEDIA_QUEUE_DEFINITION: QueueDefinition = {
  name: MEDIA_QUEUE,
  retryLimit: 3,
  retryDelaySeconds: 10,
  expireInSeconds: 600,
  deadLetter: `${MEDIA_QUEUE}.dead`,
};

/** Purga de um arquivo esquecido (feature 009, D-13): tentativas por cerca de 5 h se o armazenamento cair. */
export const PURGE_OBJECT_QUEUE_DEFINITION: QueueDefinition = {
  name: PURGE_OBJECT_QUEUE,
  retryLimit: 10,
  retryDelaySeconds: 30,
  expireInSeconds: 120,
  deadLetter: `${PURGE_OBJECT_QUEUE}.dead`,
};

/**
 * Worker de `media.purge_object` (feature 009). Sem armazenamento configurado, não assina: nada foi guardado sem ele,
 * e os jobs esperam na fila. O log leva só o resultado, nunca a chave (ela tem o SHA-256 do conteúdo).
 */
export async function startPurgeObjectWorker(config: AppConfig, pool: Pool, queue: JobQueue, logger: Logger): Promise<void> {
  let store: S3ObjectStore;
  try {
    store = buildObjectStore(config.media);
  } catch (error) {
    logger.warn({ reason: (error as Error).name }, "purga de mídia desligada: armazenamento não configurado");
    return;
  }
  const isReferenced = async (key: string) => (await pool.query("SELECT 1 FROM attachments WHERE storage_key = $1 LIMIT 1", [key])).rows.length > 0;
  const purge = createPurgeObject({ store, isReferenced });
  await queue.work<PurgeObjectJob>(PURGE_OBJECT_QUEUE, (job) =>
    withSpan("media.purge_object", async () => {
      const outcome = await purge(job);
      logger.info({ outcome }, "purga de arquivo de mídia");
    }),
  );
}

export const MEDIA_JOBS: MediaJobsOptions = {
  mediaQueue: MEDIA_QUEUE,
  processable: (kind) => (PROCESSED_KINDS as readonly string[]).includes(kind),
};

/** Falta de configuração da mídia, com a instrução para o operador (sem valores). */
export class MediaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaConfigError";
  }
}

export function buildObjectStore(media: MediaConfig): S3ObjectStore {
  if (!media.key) throw new MediaConfigError("Falta a chave de mídia no .env. Rode `npm run setup`.");
  const { endpoint, bucket, accessKey, secretKey } = media.storage;
  if (!endpoint || !accessKey || !secretKey) {
    throw new MediaConfigError("Falta a configuração do armazenamento local (S3_*) no .env. Rode `npm run setup`.");
  }
  return createS3ObjectStore({ endpoint, bucket, accessKey, secretKey, key: media.key });
}

/** O bucket precisa responder antes de qualquer gravação (importação: nada é gravado se falhar). */
export async function ensureStorage(store: S3ObjectStore): Promise<void> {
  try {
    await store.ensureBucket();
  } catch {
    throw new MediaConfigError("Não consegui gravar os áudios: o armazenamento local não respondeu. Rode `npm run setup` e tente de novo. Nada foi importado.");
  }
}

export function buildPrepare(pool: Pool, store: S3ObjectStore, media: MediaConfig, observer?: PrepareObserver): PrepareAttachments {
  return createPrepareAttachments({
    sources: { check: createIsSourceAuthorized(createPgSourceRepository(pool)) },
    store,
    storeKinds: media.storeKinds,
    ...(observer ? { observer } : {}),
  });
}

/** Escolha do motor por configuração (RN-03, D-08): trocar de motor é acrescentar um caso aqui. */
export function buildTranscriber(config: TranscriptionConfig): Transcriber {
  if (config.engine === "fake") return createFakeTranscriber();
  return createOpenAiCompatibleTranscriber({ url: config.url, model: config.model, apiKey: config.apiKey });
}

export function buildProcessAttachment(
  pool: Pool,
  queue: JobQueue,
  store: S3ObjectStore,
  transcriber: Transcriber,
  observer?: MediaObserver,
): ProcessAttachment {
  return createProcessAttachment({
    unitOfWork: createPgMediaUnitOfWork(pool, queue, { indexQueue: INDEX_QUEUE }),
    store,
    processors: [createAudioProcessor(transcriber)],
    ...(observer ? { observer } : {}),
  });
}

/** Classificação dos anexos do export pelo nome do arquivo (D-17). */
export const exportMedia = {
  isAudio: (fileName: string): boolean => mediaKindOfFileName(fileName) === "audio",
  mimeOf: mimeOfFileName,
};

/** Tipos de mídia de grupo que viram mensagem: os guardados que têm processador (hoje, só áudio). */
export function captureMediaKinds(media: MediaConfig): ("audio")[] {
  return media.storeKinds.includes("audio") ? ["audio"] : [];
}

/**
 * Entrada da captura com mídia (D-03): prepara os anexos pelo `fetchMedia` do canal e depois ingere. Sem mídia
 * configurada (chave ou S3 ausentes, ou nenhum tipo guardado), devolve a ingestão como está e avisa no log.
 */
export async function withMediaPreparation(
  config: AppConfig,
  pool: Pool,
  logger: Logger,
  observer?: PrepareObserver,
): Promise<((ingest: InboundHandler, channel: Pick<KnowledgeChannel, "fetchMedia">) => InboundHandler) | undefined> {
  const prepare = await buildMediaPrepare(config, pool, logger, "captura", observer);
  if (!prepare) return undefined;
  return (ingest, channel) => async (message: CanonicalMessage) =>
    ingest(await withSpan("media.prepare", () => prepare(message, (ref) => channel.fetchMedia(ref))));
}

/**
 * Preparo dos anexos (baixar, conferir e guardar cifrado) quando há mídia configurada; `undefined` quando não há
 * (nenhum tipo guardado, chave ou armazenamento ausentes), com o aviso no log. Usado pela captura e pelo guardar (009).
 */
export async function buildMediaPrepare(config: AppConfig, pool: Pool, logger: Logger, use: "captura" | "guardar", observer?: PrepareObserver): Promise<PrepareAttachments | undefined> {
  if (captureMediaKinds(config.media).length === 0) return undefined;
  let store: S3ObjectStore;
  try {
    store = buildObjectStore(config.media);
    await store.ensureBucket();
  } catch (error) {
    logger.warn({ reason: (error as Error).name, use }, "mídia desligada: armazenamento indisponível; os áudios não serão guardados");
    return undefined;
  }
  return buildPrepare(pool, store, config.media, observer);
}

export interface MediaWorkerHandle {
  readonly transcriber: Transcriber | undefined;
  /** Para a sondagem de saúde do motor. */
  stop(): void;
}

/**
 * Worker de mídia (D-12): assina `media.process` com a concorrência configurada, republica pendentes sem job
 * e sonda a saúde do motor. Com `PALANTIR_TRANSCRIPTION=off` ou sem armazenamento, não assina: os anexos ficam
 * `pending` e nada se perde (RF-14).
 */
export async function startMediaWorker(
  config: AppConfig,
  pool: Pool,
  queue: JobQueue,
  logger: Logger,
  hooks: { readonly observer?: OtelMediaObserver | MediaObserver } = {},
): Promise<MediaWorkerHandle> {
  const { transcription } = config.media;
  if (!transcription.enabled) {
    logger.info("transcrição desligada (PALANTIR_TRANSCRIPTION=off): os áudios ficam guardados e pendentes");
    return { transcriber: undefined, stop: () => undefined };
  }
  let store: S3ObjectStore;
  try {
    store = buildObjectStore(config.media);
    await store.ensureBucket();
  } catch (error) {
    logger.warn({ reason: (error as Error).name }, "transcrição sem armazenamento: rode npm run setup; os áudios ficam pendentes");
    return { transcriber: undefined, stop: () => undefined };
  }
  if (transcription.allowRemote) logger.warn("transcrição remota ligada: o áudio sai desta máquina");
  const transcriber = buildTranscriber(transcription);
  const process = buildProcessAttachment(pool, queue, store, transcriber, hooks.observer ?? NOOP_MEDIA_OBSERVER);
  const republished = await sweepPendingMedia(pool, queue, {
    mediaQueue: MEDIA_QUEUE,
    kinds: PROCESSED_KINDS,
    livePriority: LIVE_PRIORITY,
    expireSeconds: mediaJobExpireSeconds,
  });
  await queue.work<ProcessJob>(
    MEDIA_QUEUE,
    (job, attempt) =>
      withSpan("media.process", async () => {
        try {
          const outcome = await process(job, attempt);
          logger.info({ attachmentId: job.attachmentId, outcome }, "mídia processada");
        } catch (error) {
          logger.warn({ attachmentId: job.attachmentId, err: { name: (error as Error).name } }, "falha ao processar mídia; nova tentativa");
          throw error;
        }
      }, { "media.kind": "audio", "transcriber.engine": transcriber.engine, "transcriber.model": transcriber.model }),
    { concurrency: transcription.concurrency },
  );
  const probe = async () => {
    const observer = hooks.observer;
    if (!observer || !("transcriberUp" in observer)) return;
    observer.transcriberUp(await transcriber.health(), transcriber.engine);
    observer.queueSize("audio", await queue.pendingCount(MEDIA_QUEUE));
  };
  void probe();
  const timer = setInterval(() => void probe(), HEALTH_PROBE_MS);
  timer.unref();
  logger.info({ engine: transcriber.engine, model: transcriber.model, concurrency: transcription.concurrency, republished }, "transcrição pronta");
  return { transcriber, stop: () => clearInterval(timer) };
}

const HEALTH_PROBE_MS = 30_000;
