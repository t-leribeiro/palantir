import type { CanonicalMessage, IngestOutcome } from "../../../contracts/channel/knowledge-channel.js";
import type { IdGenerator } from "../../../shared/index.js";
import { toNewMessage, type NewMessage } from "../domain/message.js";
import { RECONCILE_WINDOW_MS, normalizeForMatch, pickCandidate, reconcileDirection } from "../domain/reconcile.js";
import type { IngestionTx, SourceAuthorization, UnitOfWork } from "./ports.js";

export interface IngestMessageDeps {
  readonly sources: SourceAuthorization;
  readonly unitOfWork: UnitOfWork;
  readonly ids: IdGenerator;
}

export type IngestMessage = (message: CanonicalMessage) => Promise<IngestOutcome>;

/**
 * RF-10: rejeita fonte não autorizada, deduplica e grava com o job de indexação na mesma transação.
 * Feature 004 (D-09): sem a própria chave na fonte, tenta reconciliar com a mesma mensagem vinda pelo outro
 * caminho (ao vivo × importada) antes de gravar uma nova; a reconciliada não gera job (o texto não mudou).
 */
export function createIngestMessage(deps: IngestMessageDeps): IngestMessage {
  return async (message) => {
    const { provider, accountId, conversationId } = message.source;
    const check = await deps.sources.check({ provider, accountId, conversationId });
    if (check.status !== "authorized") return { outcome: "rejected", reason: check.status };

    const record = toNewMessage(message, check, deps.ids());
    return deps.unitOfWork.run(async (tx) => {
      const reconciledId = await reconcile(tx, record);
      if (reconciledId) return { outcome: "reconciled", messageId: reconciledId };
      const inserted = await tx.messages.insert(record);
      if (inserted.status === "duplicate") return { outcome: "duplicate", messageId: inserted.id };
      await tx.jobs.enqueueIndex({ messageId: inserted.id, spaceId: check.spaceId, reason: "ingested" });
      return { outcome: "accepted", messageId: inserted.id };
    });
  };
}

/** Id da mensagem existente que recebeu a chave e a proveniência desta, ou `undefined` para gravar normalmente. */
async function reconcile(tx: IngestionTx, record: NewMessage): Promise<string | undefined> {
  const direction = reconcileDirection(record);
  if (!direction || !record.text) return undefined;
  if (await tx.messages.findByKey(record)) return undefined;
  const sentAt = record.sentAt.getTime();
  const rows = await tx.messages.reconcileCandidates({
    sourceId: record.sourceId,
    direction,
    from: new Date(sentAt - RECONCILE_WINDOW_MS),
    to: new Date(sentAt + RECONCILE_WINDOW_MS),
  });
  const text = normalizeForMatch(record.text);
  const match = pickCandidate(
    { sentAt: record.sentAt, authorName: record.sender.displayName },
    rows.filter((row) => normalizeForMatch(row.text) === text),
  );
  if (!match) return undefined;
  await tx.messages.attachReconciled(match.id, record, direction);
  return match.id;
}
