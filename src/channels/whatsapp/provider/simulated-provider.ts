// Provedor WhatsApp simulado (feature 003, D-03): mesma porta do real, sem rede nem número. Usado pela
// suíte de contrato, pelo E2E e pelos testes do adaptador.
import type { IncomingDirect, SessionState, WhatsAppProvider } from "./provider.js";

export interface SentText {
  readonly chatJid: string;
  readonly text: string;
}

export interface SimulatedProvider extends WhatsAppProvider {
  /** Entrega uma mensagem ao adaptador e espera ele terminar de tratá-la (inclusive a resposta). */
  deliver(message: IncomingDirect): Promise<void>;
  setState(state: SessionState, reason?: string): void;
  emitQr(qr: string): void;
  sent(): readonly SentText[];
  clearSent(): void;
  /** As próximas `count` chamadas de envio falham. */
  failNextSends(count: number): void;
  isStarted(): boolean;
}

export function createSimulatedProvider(): SimulatedProvider {
  const sent: SentText[] = [];
  const qrListeners: ((qr: string) => void)[] = [];
  const stateListeners: ((state: SessionState, reason?: string) => void)[] = [];
  let onDirect: ((message: IncomingDirect) => Promise<void>) | undefined;
  let started = false;
  let failures = 0;

  const provider: SimulatedProvider = {
    async start() {
      started = true;
      provider.setState("connected");
    },
    async stop() {
      started = false;
    },
    onQr: (listener) => void qrListeners.push(listener),
    onState: (listener) => void stateListeners.push(listener),
    onDirectMessage(listener) {
      onDirect = listener;
    },
    async sendText(chatJid, text) {
      if (!started) throw new Error("provedor simulado parado");
      if (failures > 0) {
        failures -= 1;
        throw new Error("falha simulada de envio");
      }
      sent.push({ chatJid, text });
    },
    async deliver(message) {
      if (!onDirect) throw new Error("nenhum listener de mensagem registrado");
      await onDirect(message);
    },
    setState(state, reason) {
      for (const listener of stateListeners) listener(state, reason);
    },
    emitQr(qr) {
      for (const listener of qrListeners) listener(qr);
    },
    sent: () => [...sent],
    clearSent() {
      sent.length = 0;
    },
    failNextSends(count) {
      failures = count;
    },
    isStarted: () => started,
  };
  return provider;
}
