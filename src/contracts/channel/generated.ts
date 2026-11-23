// ARQUIVO GERADO por `npm run contracts:generate` a partir de contracts/channel/*.schema.json.
// Não edite à mão: `npm run contracts:check` falha em caso de drift (ADR-0004).

/**
 * ISO 8601 com fuso obrigatório.
 */
export type ZonedDateTime = string;

/**
 * Mensagem normalizada entregue por qualquer adaptador de canal ao núcleo (contrato 1.x, ADR-0004).
 */
export interface CanonicalMessage {
  contractVersion: string;
  id: string;
  source: {
    provider: string;
    accountId: string;
    conversationId: string;
    externalMessageId?: string;
  };
  sender: {
    externalId: string;
    displayName?: string;
  };
  timestamp: ZonedDateTime;
  kind: "text" | "audio" | "image" | "document" | "link";
  text?: string;
  quotedExternalMessageId?: string;
  isForwarded: boolean;
  attachments: {
    id: string;
    mimeType: string;
    sizeBytes?: number;
    storageKey?: string;
    fetchRef?: string;
  }[];
  provenance: {
    captureMethod: "live" | "export_import" | "forwarded_to_agent";
    capturedAt: ZonedDateTime;
    adapter: string;
  };
}

/**
 * Resposta neutra do agente; cada adaptador renderiza para o seu canal (ADR-0004).
 */
export interface AgentReply {
  text: string;
  outcome: "answered" | "no_evidence" | "error";
  /**
   * @maxItems 20
   */
  citations: Citation[];
}
export interface Citation {
  index: number;
  messageId: string;
  author: string;
  sourceTitle: string;
  sentAt: string;
}
