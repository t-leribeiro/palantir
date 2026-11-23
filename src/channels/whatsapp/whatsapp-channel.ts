// Adaptador KnowledgeChannel do número do agente (feature 003). Só conversa: não captura conversas (RN-01,
// D-19). Recibo antes de responder (D-13), mensagens antigas ignoradas, `null` do agente = silêncio (RF-05),
// resposta renderizada (D-11) e espaçada por destinatário (D-12).
import type {
  AgentHandler,
  AgentReply,
  CanonicalMessage,
  ChannelCapabilities,
  KnowledgeChannel,
} from "../../contracts/channel/knowledge-channel.js";
import { CONTRACT_VERSION } from "../../contracts/channel/knowledge-channel.js";
import { validateCanonicalMessage } from "../../platform/contracts/validator.js";
import { newId, systemClock, type Clock, type IdGenerator } from "../../shared/index.js";
import { createSendPacer, systemPacerClock, type PacerClock, type SendPacer } from "./pacer.js";
import type { DirectKind, IncomingDirect, SessionState, WhatsAppProvider } from "./provider/provider.js";
import { WHATSAPP_MAX_MESSAGE_LENGTH, renderForWhatsApp } from "./render.js";

export const WHATSAPP_ADAPTER = "whatsapp";
export const WHATSAPP_PROVIDER_NAME = "whatsapp";
/** Conta do número do agente; o dono das perguntas é o remetente (`sender.externalId`). */
export const AGENT_ACCOUNT_ID = "agent";
const STALE_AFTER_MS = 10 * 60_000;
const DEFAULT_RETRY_DELAYS_MS = [1000, 2000];

/** Eventos para métricas (D-18). Nunca recebem número nem texto. */
export interface WhatsAppObserver {
  received(kind: DirectKind | "stale" | "duplicate"): void;
  replied(parts: number): void;
  unknownSender(reason: "unknown" | "unresolved"): void;
  sendFailed(): void;
  handlerFailed(): void;
  state(state: SessionState): void;
}

const noopObserver: WhatsAppObserver = {
  received: () => undefined,
  replied: () => undefined,
  unknownSender: () => undefined,
  sendFailed: () => undefined,
  handlerFailed: () => undefined,
  state: () => undefined,
};

export interface InboundReceiptsPort {
  registerIfNew(provider: string, externalMessageId: string): Promise<boolean>;
}

export interface WhatsAppChannelOptions {
  readonly provider: WhatsAppProvider;
  readonly receipts: InboundReceiptsPort;
  readonly observer?: WhatsAppObserver;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  readonly pacer?: SendPacer;
  readonly pacerIntervalMs?: number;
  readonly pacerClock?: PacerClock;
  /** Esperas entre tentativas de envio; o total de tentativas é o tamanho da lista + 1. */
  readonly sendRetryDelaysMs?: readonly number[];
}

export interface WhatsAppChannel extends KnowledgeChannel {
  state(): SessionState;
}

const CAPABILITIES: ChannelCapabilities = {
  supportsLiveCapture: false,
  supportsHistory: false,
  supportsMedia: false,
  maxMessageLength: WHATSAPP_MAX_MESSAGE_LENGTH,
};

const CONTRACT_KIND: Record<DirectKind, CanonicalMessage["kind"]> = {
  text: "text",
  audio: "audio",
  image: "image",
  sticker: "image",
  document: "document",
  video: "document",
  other: "document",
};

/** Destino de `sendReply`: JID pronto ou número em E.164. */
export function toChatJid(destination: string): string {
  return destination.includes("@") ? destination : `${destination.replace(/\D/g, "")}@s.whatsapp.net`;
}

export function createWhatsAppChannel(options: WhatsAppChannelOptions): WhatsAppChannel {
  const { provider, receipts } = options;
  const observer = options.observer ?? noopObserver;
  const clock = options.clock ?? systemClock;
  const ids = options.ids ?? newId;
  const pacer = options.pacer ?? createSendPacer({ minIntervalMs: options.pacerIntervalMs ?? 1000, clock: options.pacerClock ?? systemPacerClock });
  const retryDelays = options.sendRetryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  let onAgent: AgentHandler | undefined;
  let current: SessionState = "pairing";
  let started = false;

  provider.onState((state) => {
    current = state;
    observer.state(state);
  });

  function toCanonical(message: IncomingDirect, senderPhone: string): unknown {
    return {
      contractVersion: CONTRACT_VERSION,
      id: ids(),
      source: {
        provider: WHATSAPP_PROVIDER_NAME,
        accountId: AGENT_ACCOUNT_ID,
        conversationId: `agent:${senderPhone}`,
        externalMessageId: message.id,
      },
      sender: { externalId: senderPhone, ...(message.senderName ? { displayName: message.senderName.slice(0, 200) } : {}) },
      timestamp: message.sentAt.toISOString(),
      kind: CONTRACT_KIND[message.kind],
      ...(message.kind === "text" && message.text ? { text: message.text } : {}),
      isForwarded: false,
      attachments: [],
      provenance: { captureMethod: "forwarded_to_agent", capturedAt: clock.now().toISOString(), adapter: WHATSAPP_ADAPTER },
    };
  }

  async function sendWithRetry(chatJid: string, text: string): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await provider.sendText(chatJid, text);
        return;
      } catch (error) {
        const delay = retryDelays[attempt];
        if (delay === undefined) throw error;
        await systemPacerClock.sleep(delay);
      }
    }
  }

  async function deliver(chatJid: string, reply: AgentReply): Promise<void> {
    const parts = renderForWhatsApp(reply);
    try {
      for (const part of parts) await pacer.send(chatJid, () => sendWithRetry(chatJid, part));
      observer.replied(parts.length);
    } catch {
      observer.sendFailed();
    }
  }

  async function isFreshAndNew(message: IncomingDirect): Promise<boolean> {
    if (clock.now().getTime() - message.sentAt.getTime() > STALE_AFTER_MS) {
      observer.received("stale");
      return false;
    }
    if (!(await receipts.registerIfNew(WHATSAPP_PROVIDER_NAME, message.id))) {
      observer.received("duplicate");
      return false;
    }
    observer.received(message.kind);
    return true;
  }

  async function ask(message: CanonicalMessage): Promise<AgentReply | null | undefined> {
    if (!onAgent) return undefined;
    try {
      return await onAgent(message);
    } catch {
      observer.handlerFailed();
      return undefined;
    }
  }

  async function handleDirect(message: IncomingDirect): Promise<void> {
    if (!(await isFreshAndNew(message))) return;
    if (!message.senderPhone) {
      observer.unknownSender("unresolved");
      return;
    }
    const valid = validateCanonicalMessage(toCanonical(message, message.senderPhone));
    if (!valid.ok) {
      observer.handlerFailed();
      return;
    }
    const reply = await ask(valid.value);
    if (reply === null) observer.unknownSender("unknown");
    if (reply) await deliver(message.chatJid, reply);
  }

  provider.onDirectMessage(handleDirect);

  return {
    adapter: WHATSAPP_ADAPTER,
    async connect() {
      if (started) return;
      started = true;
      await provider.start();
    },
    async disconnect() {
      if (!started) return;
      started = false;
      await provider.stop();
    },
    capabilities: () => CAPABILITIES,
    async listConversations() {
      return [];
    },
    onMessage() {
      // O número do agente não captura conversas (RN-01); a captura é da S3, por outro número.
    },
    onAgentMessage(handler) {
      onAgent = handler;
    },
    async sendReply(destinationAccountId, reply) {
      await deliver(toChatJid(destinationAccountId), reply);
    },
    state: () => current,
  };
}
