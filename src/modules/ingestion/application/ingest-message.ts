import type { CanonicalMessage, IngestOutcome } from "../../../contracts/channel/knowledge-channel.js";
import type { IdGenerator } from "../../../shared/index.js";
import { toNewMessage } from "../domain/message.js";
import type { SourceAuthorization, UnitOfWork } from "./ports.js";

export interface IngestMessageDeps {
  readonly sources: SourceAuthorization;
  readonly unitOfWork: UnitOfWork;
  readonly ids: IdGenerator;
}

export type IngestMessage = (message: CanonicalMessage) => Promise<IngestOutcome>;

/** RF-10: rejeita fonte não autorizada, deduplica e grava com o job de indexação na mesma transação. */
export function createIngestMessage(deps: IngestMessageDeps): IngestMessage {
  return async (message) => {
    const { provider, accountId, conversationId } = message.source;
    const check = await deps.sources.check({ provider, accountId, conversationId });
    if (check.status !== "authorized") return { outcome: "rejected", reason: check.status };

    const record = toNewMessage(message, check, deps.ids());
    return deps.unitOfWork.run(async (tx) => {
      const inserted = await tx.messages.insert(record);
      if (inserted.status === "duplicate") return { outcome: "duplicate", messageId: inserted.id };
      await tx.jobs.enqueueIndex({ messageId: inserted.id, spaceId: check.spaceId, reason: "ingested" });
      return { outcome: "accepted", messageId: inserted.id };
    });
  };
}
