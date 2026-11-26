// Espera do que foi encaminhado ao agente (feature 009, D-05, D-14; ADR-0014). O conteúdo espera o "guarda em X"
// só na memória do processo do canal, por até 10 min, e some sem rastro se nada for pedido. Nunca vai para o banco.
import type { CanonicalMessage } from "../../../contracts/channel/knowledge-channel.js";

/** Quanto tempo um encaminhado espera o pedido (RN-01, RN-02). */
export const PENDING_TTL_MS = 10 * 60_000;
/** Teto de memória por dono e canal; o pedido de guardar leva só as 20 primeiras (RN-01). */
export const PENDING_HARD_LIMIT = 100;

export interface AddResult {
  /** Abriu uma leva nova: é a vez de mandar o aviso de como guardar (uma vez por leva). */
  readonly opened: boolean;
  /** `false` quando o teto de memória já foi atingido e a mensagem foi descartada. */
  readonly accepted: boolean;
}

/**
 * A espera de um dono num canal (`key`), com o contexto necessário para guardar em "sem tema" quando o dono pediu
 * para guardar sem dizer o tema e não respondeu em 10 min.
 */
export interface PendingForwards<C> {
  add(key: string, context: C, message: CanonicalMessage): AddResult;
  /** Tudo o que espera, na ordem de chegada; esvazia a espera e desfaz o "aguardando tema". */
  takeAll(key: string): readonly CanonicalMessage[];
  /** Só a mensagem citada pelo "responder", se ainda espera. */
  take(key: string, externalMessageId: string): CanonicalMessage | null;
  /** O dono pediu "guarda isso" sem tema; `false` quando não há nada esperando. */
  markAwaitingTheme(key: string): boolean;
  awaitingTheme(key: string): boolean;
  /** Quantos itens foram guardados em "sem tema" desde a última resposta (o aviso vai uma vez). */
  takeUntitledNotice(key: string): number;
}
