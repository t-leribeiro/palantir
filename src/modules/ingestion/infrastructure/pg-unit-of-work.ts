import { withTransaction, type Pool } from "../../../platform/db/index.js";
import type { JobQueue } from "../../../platform/queue/index.js";
import type { IngestionTx, UnitOfWork } from "../application/ports.js";
import { createPgMessageStore } from "./pg-message-store.js";

export const INDEX_QUEUE = "knowledge.index";

/** Gravação e enfileiramento na mesma transação do PostgreSQL (ADR-0003). */
export function createPgUnitOfWork(pool: Pool, queue: JobQueue): UnitOfWork {
  return {
    run: (work) =>
      withTransaction(pool, (client) => {
        const tx: IngestionTx = {
          messages: createPgMessageStore(client),
          jobs: {
            enqueueIndex: (job) => queue.sendInTransaction(client, INDEX_QUEUE, job, { singletonKey: job.messageId }),
          },
        };
        return work(tx);
      }),
  };
}
