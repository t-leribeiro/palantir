// Execução do job `sources.delete` (feature 006, D-08, D-09; interfaces/jobs-exclusao-e-aviso.md §1).
// Cada passo é idempotente: uma reentrega ou uma retentativa depois de falha continua de onde parou.
import type { SourceDeleteJob } from "../domain/deletion.js";
import type { DeletionStore } from "./request-deletion.js";

/** Remove os arquivos de mídia da fonte (prefixo `<space>/<source>/`); devolve quantos objetos apagou. */
export interface MediaPurger {
  purgeSource(spaceId: string, sourceId: string): Promise<number>;
}

export type ExecuteSourceDeletion = (job: SourceDeleteJob) => Promise<"completed" | "already_completed" | "missing">;

export function createExecuteSourceDeletion(deps: { readonly store: DeletionStore; readonly purger: MediaPurger }): ExecuteSourceDeletion {
  return async (job) => {
    const record = await deps.store.load(job.deletionId);
    if (!record) return "missing";
    if (record.completedAt) return "already_completed";
    await deps.store.recordCounts(record.id);
    const objects = await deps.purger.purgeSource(record.spaceId, record.sourceId);
    await deps.store.deleteSource(record.id, record.sourceId);
    return (await deps.store.complete(record.id, objects)) ? "completed" : "already_completed";
  };
}
