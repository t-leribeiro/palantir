import { withTransaction, type Pool } from "../../../platform/db/index.js";
import type { JobQueue } from "../../../platform/queue/index.js";
import type { IngestionTx, UnitOfWork } from "../application/ports.js";
import type { AttachmentKind } from "../domain/message.js";
import { createPgMessageStore } from "./pg-message-store.js";

export const INDEX_QUEUE = "knowledge.index";

/** Fila e tipos com processador (feature 005); sem isto, anexos são gravados e nada é processado. */
export interface MediaJobsOptions {
  readonly mediaQueue: string;
  readonly processable: (kind: AttachmentKind) => boolean;
}

const MIN_EXPIRE_SECONDS = 120;
const DEFAULT_EXPIRE_SECONDS = 600;

/** Prazo do job: 3× a duração, no mínimo 120 s; sem duração, 10 min (interfaces/job-media-process.md). */
export const mediaJobExpireSeconds = (durationSeconds: number | undefined): number =>
  durationSeconds === undefined ? DEFAULT_EXPIRE_SECONDS : Math.max(MIN_EXPIRE_SECONDS, Math.ceil(durationSeconds * 3));

/** Gravação e enfileiramento na mesma transação do PostgreSQL (ADR-0003). */
export function createPgUnitOfWork(pool: Pool, queue: JobQueue, media?: MediaJobsOptions): UnitOfWork {
  return {
    run: (work) =>
      withTransaction(pool, (client) => {
        const tx: IngestionTx = {
          messages: createPgMessageStore(client),
          jobs: {
            enqueueIndex: (job) => queue.sendInTransaction(client, INDEX_QUEUE, job, { singletonKey: job.messageId }),
            processes: (kind) => media?.processable(kind) ?? false,
            async enqueueMedia(job) {
              if (!media) throw new Error("Fila de mídia não configurada.");
              await queue.sendInTransaction(
                client,
                media.mediaQueue,
                { attachmentId: job.attachmentId, spaceId: job.spaceId },
                { singletonKey: job.attachmentId, priority: job.priority, expireInSeconds: mediaJobExpireSeconds(job.durationSeconds) },
              );
            },
          },
        };
        return work(tx);
      }),
  };
}
