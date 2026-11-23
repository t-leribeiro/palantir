// Porta de canal (ADR-0004, interfaces/channel-contract.md). Todo adaptador implementa esta interface;
// o núcleo só conhece CanonicalMessage e AgentReply.
import type { AgentReply, CanonicalMessage } from "./generated.js";

export type { AgentReply, CanonicalMessage, Citation } from "./generated.js";

export const CONTRACT_VERSION = "1.0.0";

export interface ConversationRef {
  readonly conversationId: string;
  readonly title: string;
  readonly kind: "group" | "direct";
}

export type IngestOutcome =
  | { readonly outcome: "accepted"; readonly messageId: string }
  | { readonly outcome: "duplicate"; readonly messageId: string }
  | {
      readonly outcome: "rejected";
      readonly reason: "not_authorized" | "invalid" | "source_deleting";
      readonly details?: readonly ContractViolation[];
    };

export interface ContractViolation {
  /** Caminho JSON Pointer do campo, ex.: "/timestamp". */
  readonly path: string;
  readonly message: string;
}

export interface ChannelCapabilities {
  readonly supportsLiveCapture: boolean;
  readonly supportsHistory: boolean;
  readonly supportsMedia: boolean;
  /** Tamanho máximo de uma mensagem enviada pelo canal, em caracteres. */
  readonly maxMessageLength: number;
}

export type InboundHandler = (message: CanonicalMessage) => Promise<IngestOutcome>;
export type AgentHandler = (message: CanonicalMessage) => Promise<AgentReply>;

export interface KnowledgeChannel {
  /** Nome do adaptador, igual a `provenance.adapter` das mensagens que ele produz. */
  readonly adapter: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  capabilities(): ChannelCapabilities;
  listConversations(): Promise<readonly ConversationRef[]>;
  /** Mensagens capturadas de fontes (grupos e conversas). */
  onMessage(handler: InboundHandler): void;
  /** Mensagens dirigidas ao agente pelo usuário. */
  onAgentMessage(handler: AgentHandler): void;
  /** Entrega uma resposta, renderizada para o canal, à conta de destino. */
  sendReply(destinationAccountId: string, reply: AgentReply): Promise<void>;
}
