// Adaptador de canal de teste (RF-07, D-12). Simula um provedor: mensagens entram por chamada direta
// (rotas HTTP do esqueleto ou testes) e as respostas ficam registradas em memória. Desde a feature 008, o anexo
// da resposta é buscado pelo loader injetado e registrado só com o tamanho e o SHA-256, nunca os bytes.
import { createHash } from "node:crypto";
import type {
  AgentHandler,
  AgentReply,
  CanonicalMessage,
  ChannelCapabilities,
  ConversationRef,
  InboundHandler,
  IngestOutcome,
  KnowledgeChannel,
  OutboundMediaLoader,
  ReplyMedia,
} from "../../contracts/channel/knowledge-channel.js";
import { CONTRACT_VERSION, MediaUnavailableError } from "../../contracts/channel/knowledge-channel.js";
import { validateCanonicalMessage } from "../../platform/contracts/validator.js";
import { newId, systemClock, type Clock, type IdGenerator } from "../../shared/index.js";
import { splitForChannel } from "../shared/split.js";

export const FAKE_ADAPTER = "fake";
export const FAKE_PROVIDER = "fake";
export const DEFAULT_ACCOUNT_ID = "fake-operator";
const MAX_MESSAGE_LENGTH = 4000;
const MAX_OUTBOX = 100;

export interface FakeInbound {
  readonly accountId?: string;
  readonly conversationId: string;
  readonly externalMessageId: string;
  readonly senderId: string;
  readonly senderName?: string;
  readonly text: string;
  readonly timestamp: string;
}

/** Áudio capturado no canal de teste (feature 005): o arquivo fica disponível para `fetchMedia`. */
export interface FakeInboundAudio extends Omit<FakeInbound, "text"> {
  readonly bytes: Uint8Array;
  readonly mimeType?: string;
  readonly durationSeconds?: number;
}

export interface FakeAgentMessage {
  readonly senderAccountId: string;
  /** Obrigatório para `kind: "text"` (o padrão). */
  readonly text?: string;
  /** Feature 009: id externo (gerado quando ausente), tipo, encaminhada, citada, legenda e áudio. */
  readonly messageId?: string;
  readonly kind?: "text" | "audio" | "image" | "document";
  readonly isForwarded?: boolean;
  readonly quotedMessageId?: string;
  readonly caption?: string;
  /** Bytes do áudio, servidos pelo `fetchMedia` (pelo HTTP, `audioBase64`). */
  readonly audio?: Uint8Array;
  readonly durationSeconds?: number;
}

/** Corpo HTTP da mensagem ao agente: o áudio vem em base64. */
export type FakeAgentRequest = Omit<FakeAgentMessage, "audio"> & { readonly audioBase64?: string };

export function fromAgentRequest(body: FakeAgentRequest): FakeAgentMessage {
  const { audioBase64, ...rest } = body;
  return audioBase64 ? { ...rest, audio: new Uint8Array(Buffer.from(audioBase64, "base64")) } : rest;
}

/** Anexo da resposta como o canal de teste o entregou (feature 008): `sent`, ou o texto de falha no lugar. */
export interface OutboxMedia {
  readonly ref: string;
  readonly kind: ReplyMedia["kind"];
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256?: string;
  readonly outcome: "sent" | "failed" | "missing";
}

export interface OutboxItem {
  readonly destinationAccountId: string;
  readonly reply: AgentReply;
  readonly parts: readonly string[];
  readonly rendered: string;
  readonly sentAt: string;
  readonly media?: readonly OutboxMedia[];
}

export interface FakeChannelOptions {
  readonly conversations?: readonly ConversationRef[];
  readonly ids?: IdGenerator;
  readonly clock?: Clock;
  /** Chamado a cada mensagem rejeitada pelo contrato (métrica channel_invalid_messages_total). */
  readonly onInvalid?: () => void;
  /** Busca os bytes do anexo da resposta (contrato 1.4.0); sem ele, o anexo vira o texto de falha. */
  readonly loadMedia?: OutboundMediaLoader;
}

/** Entrega o anexo pelo loader; na falha, o texto de falha da resposta entra nas partes (D-10). */
async function deliverMedia(load: OutboundMediaLoader | undefined, destination: string, media: ReplyMedia): Promise<OutboxMedia> {
  const base = { ref: media.ref, kind: media.kind, mimeType: media.mimeType, sizeBytes: media.sizeBytes };
  if (!load) return { ...base, outcome: "missing" };
  try {
    const { bytes, mimeType } = await load(destination, media.ref);
    return { ...base, mimeType, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), outcome: "sent" };
  } catch {
    return { ...base, outcome: "failed" };
  }
}

export interface FakeChannel extends KnowledgeChannel {
  receiveInbound(input: FakeInbound): Promise<IngestOutcome>;
  receiveInboundAudio(input: FakeInboundAudio): Promise<IngestOutcome>;
  /** Os próximos `count` downloads falham com `download_failed`. */
  failNextFetches(count: number): void;
  receiveAgentMessage(input: FakeAgentMessage): Promise<AgentReply | null>;
  outbox(limit?: number): readonly OutboxItem[];
  clearOutbox(): void;
}

class NotConnectedError extends Error {
  constructor() {
    super("Adaptador fake desconectado: chame connect() antes de entregar mensagens.");
    this.name = "NotConnectedError";
  }
}

export function createFakeChannel(options: FakeChannelOptions = {}): FakeChannel {
  const ids = options.ids ?? newId;
  const clock = options.clock ?? systemClock;
  const conversations = options.conversations ?? [];
  const sent: OutboxItem[] = [];
  let connected = false;
  let onInbound: InboundHandler | undefined;
  let onAgent: AgentHandler | undefined;
  const media = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  let fetchFailures = 0;

  const capabilities: ChannelCapabilities = {
    supportsLiveCapture: true,
    supportsHistory: false,
    supportsMedia: true,
    maxMessageLength: MAX_MESSAGE_LENGTH,
  };

  function build(input: {
    accountId: string;
    conversationId: string;
    externalMessageId?: string;
    senderId: string;
    senderName?: string;
    text: string;
    timestamp: string;
    captureMethod: CanonicalMessage["provenance"]["captureMethod"];
  }): unknown {
    return {
      contractVersion: CONTRACT_VERSION,
      id: ids(),
      source: {
        provider: FAKE_PROVIDER,
        accountId: input.accountId,
        conversationId: input.conversationId,
        ...(input.externalMessageId ? { externalMessageId: input.externalMessageId } : {}),
      },
      sender: { externalId: input.senderId, ...(input.senderName ? { displayName: input.senderName } : {}) },
      timestamp: input.timestamp,
      kind: "text",
      text: input.text,
      isForwarded: false,
      attachments: [],
      provenance: { captureMethod: input.captureMethod, capturedAt: clock.now().toISOString(), adapter: FAKE_ADAPTER },
    };
  }

  /** Feature 009: tipo, texto ou legenda, encaminhada, citada e o anexo do áudio (servido pelo `fetchMedia`). */
  function agentExtras(base: Record<string, unknown>, input: FakeAgentMessage, externalMessageId: string): Record<string, unknown> {
    const { text: _text, ...rest } = base;
    const kind = input.kind ?? "text";
    const text = kind === "text" ? input.text : input.caption;
    const quoted = input.quotedMessageId ? { quotedExternalMessageId: input.quotedMessageId } : {};
    return { ...rest, kind, ...(text ? { text } : {}), isForwarded: input.isForwarded === true, ...quoted, attachments: audioOf(input, externalMessageId) };
  }

  function audioOf(input: FakeAgentMessage, externalMessageId: string): readonly Record<string, unknown>[] {
    if (input.kind !== "audio") return [];
    const fetchRef = `fake-media:${externalMessageId}`;
    const mimeType = "audio/ogg; codecs=opus";
    if (input.audio) media.set(fetchRef, { bytes: input.audio, mimeType });
    const duration = input.durationSeconds === undefined ? {} : { durationSeconds: input.durationSeconds };
    return [{ id: `${externalMessageId}:0`, mimeType, ...(input.audio ? { sizeBytes: input.audio.length, fetchRef } : {}), ...duration }];
  }

  function requireConnected<T>(handler: T | undefined): T {
    if (!connected) throw new NotConnectedError();
    if (!handler) throw new Error("Nenhum handler registrado no adaptador fake.");
    return handler;
  }

  const channel: FakeChannel = {
    adapter: FAKE_ADAPTER,
    async connect() {
      connected = true;
    },
    async disconnect() {
      connected = false;
    },
    capabilities: () => capabilities,
    async listConversations() {
      return conversations;
    },
    onMessage(handler) {
      onInbound = handler;
    },
    onAgentMessage(handler) {
      onAgent = handler;
    },
    async fetchMedia(fetchRef) {
      const item = media.get(fetchRef);
      if (!item) throw new MediaUnavailableError("expired");
      if (fetchFailures > 0) {
        fetchFailures -= 1;
        throw new MediaUnavailableError("download_failed");
      }
      return item;
    },
    failNextFetches(count) {
      fetchFailures = count;
    },
    async receiveInboundAudio(input) {
      const handler = requireConnected(onInbound);
      const fetchRef = `fake-media:${input.externalMessageId}`;
      const mimeType = input.mimeType ?? "audio/ogg; codecs=opus";
      media.set(fetchRef, { bytes: input.bytes, mimeType });
      const text = build({ ...input, text: "-", accountId: input.accountId ?? DEFAULT_ACCOUNT_ID, captureMethod: "live" }) as Record<string, unknown>;
      const { text: _text, ...base } = text;
      const duration = input.durationSeconds === undefined ? {} : { durationSeconds: input.durationSeconds };
      const message = { ...base, kind: "audio", attachments: [{ id: `${input.externalMessageId}:0`, mimeType, sizeBytes: input.bytes.length, fetchRef, ...duration }] };
      const valid = validateCanonicalMessage(message);
      if (!valid.ok) {
        options.onInvalid?.();
        return { outcome: "rejected", reason: "invalid", details: valid.error.details };
      }
      return handler(valid.value);
    },
    async sendReply(destinationAccountId, reply) {
      const parts = splitForChannel(reply, MAX_MESSAGE_LENGTH);
      const media: OutboxMedia[] = [];
      for (const item of reply.media ?? []) {
        const delivered = await deliverMedia(options.loadMedia, destinationAccountId, item);
        media.push(delivered);
        if (delivered.outcome !== "sent") parts.push(item.failureText);
      }
      const extra = media.length > 0 ? { media } : {};
      sent.unshift({ destinationAccountId, reply, parts, rendered: parts.join("\n"), sentAt: clock.now().toISOString(), ...extra });
      sent.length = Math.min(sent.length, MAX_OUTBOX);
    },
    async receiveInbound(input) {
      const handler = requireConnected(onInbound);
      const message = build({ ...input, accountId: input.accountId ?? DEFAULT_ACCOUNT_ID, captureMethod: "live" });
      const valid = validateCanonicalMessage(message);
      if (!valid.ok) {
        options.onInvalid?.();
        return { outcome: "rejected", reason: "invalid", details: valid.error.details };
      }
      return handler(valid.value);
    },
    async receiveAgentMessage(input) {
      const handler = requireConnected(onAgent);
      const externalMessageId = input.messageId ?? ids();
      const base = build({
        accountId: input.senderAccountId,
        conversationId: `agent:${input.senderAccountId}`,
        externalMessageId,
        senderId: input.senderAccountId,
        text: input.text ?? "",
        timestamp: clock.now().toISOString(),
        captureMethod: "forwarded_to_agent",
      }) as Record<string, unknown>;
      const message = agentExtras(base, input, externalMessageId);
      const valid = validateCanonicalMessage(message);
      if (!valid.ok) throw new Error(`Mensagem ao agente inválida: ${valid.error.details.map((d) => d.path).join(", ")}`);
      const reply = await handler(valid.value);
      if (reply) await channel.sendReply(input.senderAccountId, reply);
      return reply;
    },
    outbox: (limit = 20) => sent.slice(0, limit),
    clearOutbox() {
      sent.length = 0;
    },
  };
  return channel;
}
