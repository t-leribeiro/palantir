// Adaptador de canal de teste (RF-07, D-12). Simula um provedor: mensagens entram por chamada direta
// (rotas HTTP do esqueleto ou testes) e as respostas ficam registradas em memória.
import type {
  AgentHandler,
  AgentReply,
  CanonicalMessage,
  ChannelCapabilities,
  ConversationRef,
  InboundHandler,
  IngestOutcome,
  KnowledgeChannel,
} from "../../contracts/channel/knowledge-channel.js";
import { CONTRACT_VERSION } from "../../contracts/channel/knowledge-channel.js";
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

export interface FakeAgentMessage {
  readonly senderAccountId: string;
  readonly text: string;
}

export interface OutboxItem {
  readonly destinationAccountId: string;
  readonly reply: AgentReply;
  readonly parts: readonly string[];
  readonly rendered: string;
  readonly sentAt: string;
}

export interface FakeChannelOptions {
  readonly conversations?: readonly ConversationRef[];
  readonly ids?: IdGenerator;
  readonly clock?: Clock;
  /** Chamado a cada mensagem rejeitada pelo contrato (métrica channel_invalid_messages_total). */
  readonly onInvalid?: () => void;
}

export interface FakeChannel extends KnowledgeChannel {
  receiveInbound(input: FakeInbound): Promise<IngestOutcome>;
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

  const capabilities: ChannelCapabilities = {
    supportsLiveCapture: true,
    supportsHistory: false,
    supportsMedia: false,
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
    async sendReply(destinationAccountId, reply) {
      const parts = splitForChannel(reply, MAX_MESSAGE_LENGTH);
      sent.unshift({ destinationAccountId, reply, parts, rendered: parts.join("\n"), sentAt: clock.now().toISOString() });
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
      const message = build({
        accountId: input.senderAccountId,
        conversationId: `agent:${input.senderAccountId}`,
        senderId: input.senderAccountId,
        text: input.text,
        timestamp: clock.now().toISOString(),
        captureMethod: "forwarded_to_agent",
      });
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
