// Estado curto da conversa com o agente (feature 006, D-02): a última lista mostrada (30 min) e a ação que
// espera confirmação (5 min). Uma linha por usuário e canal.
import type { ListItem } from "../domain/conversation-ref.js";

export interface PendingAction {
  readonly action: "follow" | "delete";
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
