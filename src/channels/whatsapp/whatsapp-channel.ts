// Adaptador KnowledgeChannel do WhatsApp. Papel `answer` (feature 003): mensagens diretas viram perguntas ao
// agente, com recibo antes de responder (D-13), mensagens antigas ignoradas, `null` = silêncio (RF-05), resposta
// renderizada (D-11) e espaçada (D-12). Papel `capture` (feature 004, D-02): mensagens de grupos autorizados
// viram CanonicalMessage `live` (capture.ts). No modo de um número, o mesmo canal tem os dois papéis.
import type {
  AgentHandler,
  AgentReply,
  CanonicalMessage,
  ChannelCapabilities,
  InboundHandler,
  KnowledgeChannel,
  OutboundMediaLoader,
  ReplyMedia,
} from "../../contracts/channel/knowledge-channel.js";
import { CONTRACT_VERSION } from "../../contracts/channel/knowledge-channel.js";
import { validateCanonicalMessage } from "../../platform/contracts/validator.js";
import { newId, systemClock, type Clock, type IdGenerator } from "../../shared/index.js";
import { createGroupCapture, type CaptureObserver, type CapturePorts } from "./capture.js";
import { createSendPacer, systemPacerClock, type PacerClock, type SendPacer } from "./pacer.js";
import type { DirectKind, IncomingDirect, SessionState, WhatsAppProvider } from "./provider/provider.js";
import { WHATSAPP_MAX_MESSAGE_LENGTH, renderForWhatsApp } from "./render.js";

export const WHATSAPP_ADAPTER = "whatsapp";
export const WHATSAPP_PROVIDER_NAME = "whatsapp";
/** Conta do número do agente; o dono das perguntas é o remetente (`sender.externalId`). */
export const AGENT_ACCOUNT_ID = "agent";
const STALE_AFTER_MS = 10 * 60_000;
const DEFAULT_RETRY_DELAYS_MS = [1000, 2000];

/** Eventos para métricas (D-18 da S2, D-16 da S3). Nunca recebem número nem texto. */
export interface WhatsAppObserver extends CaptureObserver {
  received(kind: DirectKind | "stale" | "duplicate"): void;
  replied(parts: number): void;
  unknownSender(reason: "unknown" | "unresolved"): void;
  sendFailed(): void;
  handlerFailed(): void;
  state(state: SessionState): void;
  /** Anexo da resposta (feature 008, D-12): entregue, falhou ou sem loader. */
  mediaSent?(outcome: "sent" | "failed" | "missing"): void;
}

const noopObserver: WhatsAppObserver = {
  received: () => undefined,
  replied: () => undefined,
  unknownSender: () => undefined,
  sendFailed: () => undefined,
  handlerFailed: () => undefined,
  state: () => undefined,
  captured: () => undefined,
  captureDiscarded: () => undefined,
  captureIgnoredMedia: () => undefined,
};

/** Papéis do canal (D-02): responder ao dono, capturar grupos autorizados, ou os dois (modo de um número). */
export interface WhatsAppRoles {
  readonly answer: boolean;
  readonly capture: boolean;
}

const ANSWER_ONLY: WhatsAppRoles = { answer: true, capture: false };

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
  /** Padrão: só responder (S2). Com `capture`, `capturePorts` é obrigatório. */
  readonly roles?: WhatsAppRoles;
  readonly capturePorts?: CapturePorts;
  /** Tipos de mídia de grupo que viram mensagem (feature 005; vem de PALANTIR_MEDIA_STORE_KINDS). */
  readonly captureMediaKinds?: readonly DirectKind[];
  /** Busca os bytes do anexo da resposta (contrato 1.4.0, D-08); sem ele, o anexo vira o texto de falha. */
  readonly loadMedia?: OutboundMediaLoader;
}

export interface WhatsAppChannel extends KnowledgeChannel {
  state(): SessionState;
}

const capabilitiesFor = (roles: WhatsAppRoles): ChannelCapabilities => ({
  supportsLiveCapture: roles.capture,
  supportsHistory: false,
  supportsMedia: true,
  maxMessageLength: WHATSAPP_MAX_MESSAGE_LENGTH,
});

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

/** Padrões de envio (ritmo e tentativas). */
function sendDefaults(options: WhatsAppChannelOptions) {
  return {
    pacer: options.pacer ?? createSendPacer({ minIntervalMs: options.pacerIntervalMs ?? 1000, clock: options.pacerClock ?? systemPacerClock }),
    retryDelays: options.sendRetryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS,
  };
}

/** Padrões das opções, fora da fábrica para manter a complexidade dela baixa. */
function resolveOptions(options: WhatsAppChannelOptions) {
  const roles = options.roles ?? ANSWER_ONLY;
  if (roles.capture && !options.capturePorts) throw new Error("O papel de captura exige as portas de captura.");
  return {
    ...sendDefaults(options),
    observer: options.observer ?? noopObserver,
    clock: options.clock ?? systemClock,
    ids: options.ids ?? newId,
    roles,
    capturePorts: roles.capture ? options.capturePorts : undefined,
  };
}

export function createWhatsAppChannel(options: WhatsAppChannelOptions): WhatsAppChannel {
  const { provider, receipts } = options;
  const { observer, clock, ids, pacer, retryDelays, roles, capturePorts } = resolveOptions(options);
  let onAgent: AgentHandler | undefined;
  let onInbound: InboundHandler | undefined;
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
      // Contrato 1.3.0: áudio exige anexo. Ao agente, áudio ainda não é baixado (RN-09 da 005, S8 decide).
      attachments: message.kind === "audio" ? [{ id: `${message.id}:0`, mimeType: "audio/ogg" }] : [],
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

  async function sendAudioWithRetry(chatJid: string, bytes: Uint8Array, media: ReplyMedia): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await provider.sendAudio(chatJid, bytes, media.mimeType, media.durationSeconds);
        return;
      } catch (error) {
        const delay = retryDelays[attempt];
        if (delay === undefined) throw error;
        await systemPacerClock.sleep(delay);
      }
    }
  }

  /**
   * Anexo depois do texto (D-10). `accountId` é a conta do dono em E.164, que o loader confere; `chatJid` é para
   * onde enviar (pode ser um LID). Falhou ou não há loader: vai o texto de falha da resposta.
   */
  async function deliverMedia(chatJid: string, accountId: string, media: ReplyMedia): Promise<void> {
    let outcome: "sent" | "failed" | "missing" = "missing";
    try {
      if (options.loadMedia) {
        outcome = "failed";
        const { bytes } = await options.loadMedia(accountId, media.ref);
        await pacer.send(chatJid, () => sendAudioWithRetry(chatJid, bytes, media));
        outcome = "sent";
      }
    } catch {
      // segue para o texto de falha
    }
    observer.mediaSent?.(outcome);
    if (outcome !== "sent") await pacer.send(chatJid, () => sendWithRetry(chatJid, media.failureText));
  }

  async function deliver(chatJid: string, reply: AgentReply, accountId: string): Promise<void> {
    const parts = renderForWhatsApp(reply);
    try {
      for (const part of parts) await pacer.send(chatJid, () => sendWithRetry(chatJid, part));
      observer.replied(parts.length);
      for (const media of reply.media ?? []) await deliverMedia(chatJid, accountId, media);
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
    if (!roles.answer) {
      // Número só de captura (modo de dois números): mensagem direta não vira pergunta nem conhecimento (RN-08).
      observer.captureDiscarded("direct");
      return;
    }
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
    if (reply) await deliver(message.chatJid, reply, message.senderPhone);
  }

  provider.onDirectMessage(handleDirect);

  if (capturePorts) {
    provider.onGroupMessage(
      createGroupCapture({
        ports: capturePorts,
        observer,
        ids,
        clock,
        adapter: WHATSAPP_ADAPTER,
        inbound: () => onInbound,
        onError: () => observer.handlerFailed(),
        mediaKinds: options.captureMediaKinds ?? [],
      }),
    );
    provider.onGroupsChanged((groups, complete) => {
      capturePorts.syncGroups(groups, complete).catch(() => observer.handlerFailed());
    });
  }

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
    capabilities: () => capabilitiesFor(roles),
    async listConversations() {
      if (!capturePorts) return [];
      return (await capturePorts.knownGroups()).map((g) => ({ conversationId: g.groupId, title: g.subject, kind: "group" as const }));
    },
    onMessage(handler) {
      onInbound = handler;
    },
    onAgentMessage(handler) {
      onAgent = handler;
    },
    async sendReply(destinationAccountId, reply) {
      await deliver(toChatJid(destinationAccountId), reply, destinationAccountId);
    },
    /** O núcleo só chama depois de conferir a autorização (D-03); a referência vale por pouco tempo. */
    async fetchMedia(fetchRef) {
      return { bytes: await provider.downloadMedia(fetchRef), mimeType: "application/octet-stream" };
    },
    state: () => current,
  };
}
