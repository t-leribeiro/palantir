import type { CanonicalMessage, IngestOutcome } from "../../../contracts/channel/knowledge-channel.js";
import type { IdGenerator } from "../../../shared/index.js";
import { hasUnpreparedAttachment, toNewMessage, type NewMessage } from "../domain/message.js";
import { RECONCILE_WINDOW_MS, keyDirection, normalizeForMatch, pickCandidate, reconcileDirection } from "../domain/reconcile.js";
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
 * Feature 005 (D-12, D-16): grava o anexo preparado e publica `media.process` na mesma transação; o áudio
 * reconcilia pelo SHA-256 do arquivo; anexo anunciado e não preparado é recusado.
 */
export function createIngestMessage(deps: IngestMessageDeps): IngestMessage {
  return async (message) => {
    const { provider, accountId, conversationId } = message.source;
    const check = await deps.sources.check({ provider, accountId, conversationId });
    if (check.status !== "authorized") return { outcome: "rejected", reason: check.status };
    if (hasUnpreparedAttachment(message)) return { outcome: "rejected", reason: "invalid" };

    const record = toNewMessage(message, check, deps.ids());
    return deps.unitOfWork.run(async (tx) => {
      const reconciledId = await reconcile(tx, record);
      if (reconciledId) return { outcome: "reconciled", messageId: reconciledId };
      const inserted = await tx.messages.insert(record);
      if (inserted.status === "duplicate") return { outcome: "duplicate", messageId: inserted.id };
      await recordAttachment(tx, record, inserted.id);
      await tx.jobs.enqueueIndex({ messageId: inserted.id, spaceId: check.spaceId, reason: "ingested" });
      return { outcome: "accepted", messageId: inserted.id };
    });
  };
}

/** Anexo e, quando há processador para o tipo e o arquivo está guardado, o job `media.process` (outbox). */
async function recordAttachment(tx: IngestionTx, record: NewMessage, messageId: string): Promise<void> {
  const attachment = record.attachment;
  if (!attachment) return;
  const processable = attachment.storageStatus === "stored" && tx.jobs.processes(attachment.mediaKind);
  const attachmentId = await tx.messages.insertAttachment(messageId, attachment, processable ? "pending" : "not_applicable");
  if (!processable) return;
  await tx.jobs.enqueueMedia({
    attachmentId,
    spaceId: record.spaceId,
    priority: record.provenance.captureMethod === "live" ? LIVE_PRIORITY : 0,
    durationSeconds: attachment.durationSeconds,
  });
}

/** Áudio ao vivo na frente do backlog de uma importação grande (RN-07). */
export const LIVE_PRIORITY = 10;

/** Id da mensagem existente que recebeu a chave e a proveniência desta, ou `undefined` para gravar normalmente. */
async function reconcile(tx: IngestionTx, record: NewMessage): Promise<string | undefined> {
  if (record.kind === "audio") return reconcileAudio(tx, record);
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

/** Feature 005 (D-16): mesma fonte, até 60 s e mesmo arquivo (SHA-256). Sem hash, não há como casar. */
async function reconcileAudio(tx: IngestionTx, record: NewMessage): Promise<string | undefined> {
  const direction = keyDirection(record);
  const sha256 = record.attachment?.sha256;
  if (!direction || !sha256) return undefined;
  if (await tx.messages.findByKey(record)) return undefined;
  const sentAt = record.sentAt.getTime();
  const rows = await tx.messages.audioReconcileCandidates({
    sourceId: record.sourceId,
    direction,
    from: new Date(sentAt - RECONCILE_WINDOW_MS),
    to: new Date(sentAt + RECONCILE_WINDOW_MS),
    sha256,
  });
  const match = pickCandidate({ sentAt: record.sentAt, authorName: record.sender.displayName }, rows);
  if (!match) return undefined;
  await tx.messages.attachReconciled(match.id, record, direction);
  return match.id;
}
