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
  /** Encaminhada (feature 009, D-02). */
  readonly isForwarded?: boolean;
  /** Id da mensagem citada pelo "responder" do WhatsApp. */
  readonly quotedId?: string;
  /** Legenda de foto, vídeo ou documento. */
  readonly caption?: string;
  /** Áudio anunciado, como na captura de grupos: só é baixado se o dono pedir para guardar. */
  readonly media?: IncomingMedia;
}

/** Mensagem de grupo (feature 004, D-03, D-11): só com captura ligada, já filtrada (sem `fromMe`, reação, edição). */
export interface IncomingGroupMessage {
  readonly id: string;
  /** "<número>@g.us". */
  readonly groupId: string;
  /** Autor em E.164; `null` quando só há LID sem mapeamento. */
  readonly senderPhone: string | null;
  /** "lid:<id>" quando o autor só é conhecido por LID. */
  readonly senderLid?: string;
  readonly senderName?: string;
  readonly kind: DirectKind;
  readonly text?: string;
  readonly sentAt: Date;
  /** Mídia anunciada (feature 005, D-18): o arquivo só é baixado por `downloadMedia`, depois da autorização. */
  readonly media?: IncomingMedia;
}

export interface IncomingMedia {
  readonly mimeType: string;
  /** Duração informada pelo WhatsApp (áudio e vídeo). */
  readonly seconds?: number;
  readonly sizeBytes?: number;
  /** Referência para `downloadMedia`; vale por pouco tempo (15 min, 500 mensagens). */
  readonly fetchRef: string;
}

/** Grupo como o número o vê: nome e quantidade de participantes, sem pessoas. */
export interface GroupInfo {
  readonly groupId: string;
  readonly subject: string;
  readonly participants: number;
}

export interface WhatsAppProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
  onQr(listener: (qr: string) => void): void;
  onState(listener: (state: SessionState, reason?: string) => void): void;
  onDirectMessage(listener: (message: IncomingDirect) => Promise<void>): void;
  /** Recusa destino de grupo: nenhum número escreve em grupos (RN-08 da S3, D-15). */
  sendText(chatJid: string, text: string): Promise<void>;
  /** Mensagem de voz (feature 008, D-09), só em resposta ao dono; recusa grupo, como `sendText`. */
  sendAudio(chatJid: string, audio: Uint8Array, mimeType: string, seconds?: number): Promise<void>;
  /** Mensagens de grupo; só chegam com `acceptGroups` (feature 004). */
  onGroupMessage(listener: (message: IncomingGroupMessage) => Promise<void>): void;
  /** Grupos do número; `complete` = lista inteira (quem não está nela saiu). */
  onGroupsChanged(listener: (groups: readonly GroupInfo[], complete: boolean) => void): void;
  listGroups(): Promise<readonly GroupInfo[]>;
  /** Baixa a mídia anunciada (feature 005); `MediaUnavailableError("expired")` se a referência caducou. */
  downloadMedia(fetchRef: string): Promise<Uint8Array>;
}
