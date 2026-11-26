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
  /**
   * Texto comum do dono (decisão da demonstração, 2026-11-26): o WhatsApp não marca como encaminhada a mensagem que
   * o próprio dono escreveu. O texto fica na memória por 10 min, para poder ser citado. Se chegou junto (até
   * `windowMs` pela hora da mensagem) de outro texto comum ou de um encaminhado que espera, a leva inteira passa a
   * esperar o pedido. `windowMs = 0` desliga a leva.
   */
  noteText(key: string, context: C, message: CanonicalMessage, windowMs: number): BurstResult;
  /** O texto ainda é comum, isto é, não foi levado por uma leva? */
  isLoose(key: string, externalMessageId: string): boolean;
  /**
   * Uma mensagem do dono dos últimos 10 min, citada pelo "responder": texto comum ou encaminhado, guardado ou não.
   * Deixa de ser texto comum (não entra mais numa leva), mas continua podendo ser citada.
   */
  takeRecent(key: string, externalMessageId: string): CanonicalMessage | null;
}

export interface BurstResult {
  /** O texto entrou numa leva e espera o pedido, como um encaminhado. */
  readonly batched: boolean;
  /** A leva começou agora: é a vez do aviso. */
  readonly opened: boolean;
}
