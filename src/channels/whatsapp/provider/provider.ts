// Porta do provedor WhatsApp (feature 003: D-03, interfaces/whatsapp-provider.md). O adaptador só conhece
// esta interface; a biblioteca não oficial fica em baileys-provider.ts e o simulador serve aos testes.

export type SessionState = "pairing" | "connected" | "reconnecting" | "logged_out";

export type DirectKind = "text" | "audio" | "image" | "document" | "video" | "sticker" | "other";

/** Mensagem 1:1 recebida pelo número do agente, já filtrada (sem grupos, status, reações nem `fromMe`). */
export interface IncomingDirect {
  readonly id: string;
  /** Para onde responder. */
  readonly chatJid: string;
  /** Remetente em E.164; `null` quando não foi possível resolver o número (LID sem mapeamento). */
  readonly senderPhone: string | null;
  readonly kind: DirectKind;
  readonly text?: string;
  readonly sentAt: Date;
  readonly senderName?: string;
}

export interface WhatsAppProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
  onQr(listener: (qr: string) => void): void;
  onState(listener: (state: SessionState, reason?: string) => void): void;
  onDirectMessage(listener: (message: IncomingDirect) => Promise<void>): void;
  sendText(chatJid: string, text: string): Promise<void>;
}
