// Estado curto da conversa com o agente (feature 006, D-02): a última lista mostrada (30 min) e a ação que
// espera confirmação (5 min). Uma linha por usuário e canal. Desde a feature 008, também as citações da última
// resposta com citações, para o "mostra a N" (D-02): só ids e a faixa do trecho, nunca texto.
import type { ListItem } from "../domain/conversation-ref.js";

export interface PendingAction {
  /** `forget` (feature 009): "esquece a N"; `ref` é o id da mensagem guardada e `title`, o tema. */
  readonly action: "follow" | "delete" | "forget";
  readonly ref: string;
  readonly title: string;
}

export interface StoredListing {
  readonly items: readonly ListItem[];
  readonly page: number;
  readonly at: Date;
}

export interface StoredPending {
  readonly pending: PendingAction;
  readonly expiresAt: Date;
}

export interface ConversationStateStore {
  listing(userId: string, provider: string): Promise<StoredListing | null>;
  saveListing(userId: string, provider: string, listing: StoredListing): Promise<void>;
  pending(userId: string, provider: string): Promise<StoredPending | null>;
  savePending(userId: string, provider: string, pending: StoredPending): Promise<void>;
  /** Consome a ação pendente só se ainda é a mesma e está no prazo (atômico): duas confirmações executam uma vez. */
  takePending(userId: string, provider: string, ref: string, now: Date): Promise<boolean>;
  clearPending(userId: string, provider: string): Promise<void>;
}

/** Uma citação da última resposta, como foi mostrada: o número e o que basta para achar a mensagem de novo. */
export interface StoredCitation {
  readonly index: number;
  readonly messageId: string;
  readonly kind?: string;
  readonly audioStartS?: number;
  readonly audioEndS?: number;
}

export interface StoredCitations {
  readonly items: readonly StoredCitation[];
  /** Momento da resposta; a lista vale 2 h a partir dele (RN-01). */
  readonly at: Date;
}

/** Citações da última resposta com citações (feature 008, D-02, D-03). */
export interface CitationStore {
  citations(userId: string, provider: string): Promise<StoredCitations | null>;
  /** Substitui a lista anterior; não mexe na lista de grupos nem na ação pendente. */
  saveCitations(userId: string, provider: string, citations: StoredCitations): Promise<void>;
}
