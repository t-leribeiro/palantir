// Avisos que o agente manda sem pergunta (feature 006, RN-08: só o fim de uma exclusão pedida pelo dono).

/** Fila consumida pelo processo do canal, que tem como mandar a mensagem (D-10). */
export const AGENT_NOTIFY_QUEUE = "agent.notify";

export interface AgentNotifyJob {
  readonly kind: "source_deleted";
  readonly deletionId: string;
}
