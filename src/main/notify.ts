// Aviso de exclusão concluída (feature 006, D-10; interfaces/jobs-exclusao-e-aviso.md §2). O processo do canal
// consome a fila do seu canal e manda pelo `sendReply` do contrato: a única mensagem sem pergunta (RN-08).
import type { AgentReply } from "../contracts/channel/knowledge-channel.js";
import { AGENT_NOTIFY_QUEUE, deletionNotice, type AgentNotifyJob } from "../modules/agent/index.js";
import { createPgDeletionNotices, noticeQueueFor, type DeletionNotices } from "../modules/sources/index.js";
import { managementObserver } from "./management.js";
import type { Pool } from "../platform/db/index.js";
import type { Logger } from "../platform/logging/logger.js";
import type { JobQueue } from "../platform/queue/index.js";
import { withSpan } from "../platform/telemetry/index.js";

export type SendReply = (destinationAccountId: string, reply: AgentReply) => Promise<void>;

export type NotifyOutcome = "sent" | "duplicate";

/** Reivindica, manda e esquece o nome; se o envio falhar, devolve a reivindicação e relança. */
export function createDeletionNotifier(notices: DeletionNotices, provider: string, send: SendReply) {
  return async (job: AgentNotifyJob): Promise<NotifyOutcome> => {
    const claimed = await notices.claim(job.deletionId, provider);
    if (!claimed) return "duplicate";
    const text = deletionNotice(claimed.title ?? "a conversa", claimed);
    try {
      await send(claimed.accountId, { text, outcome: "help", citations: [] });
    } catch (error) {
      await notices.release(job.deletionId);
      throw error;
    }
    await notices.forgetTitle(job.deletionId);
    return "sent";
  };
}

/** Liga o consumidor da fila de avisos do canal. Log sem nome nem conta: só o id do pedido e o resultado. */
export async function startDeletionNotices(pool: Pool, queue: JobQueue, provider: string, send: SendReply, logger: Logger): Promise<void> {
  const notify = createDeletionNotifier(createPgDeletionNotices(pool), provider, send);
  await queue.work<AgentNotifyJob>(noticeQueueFor(AGENT_NOTIFY_QUEUE, provider), (job) =>
    withSpan("agent.notify", async () => {
      try {
        const outcome = await notify(job);
        managementObserver().notification(outcome);
        logger.info({ deletionId: job.deletionId, outcome }, "aviso de exclusão tratado");
      } catch (error) {
        managementObserver().notification("failed");
        throw error;
      }
    }),
  );
}
