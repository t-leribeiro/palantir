// Pedido de exclusão de fonte (feature 006, D-07; RN-06). Numa transação: fonte `deleting` (some da busca na
// hora), captura revogada, pedido e auditoria gravados e job `sources.delete` publicado pelo outbox.
import type { AuditChannel } from "./audit.js";

export interface DeletionRequest {
  readonly spaceId: string;
  readonly sourceId: string;
  readonly requestedBy: string;
  readonly channel: AuditChannel;
  /** Conta que recebe o aviso de conclusão; sem ela (terminal sem conta verificada), não há aviso. */
  readonly notify?: { readonly provider: string; readonly accountId: string };
  /** Nome mostrado no aviso; padrão: o nome da fonte. */
  readonly title?: string;
}

export type RequestDeletionResult =
  | { readonly outcome: "requested"; readonly deletionId: string; readonly title: string }
  | { readonly outcome: "already_deleting"; readonly title: string }
  | { readonly outcome: "not_found" };

export interface DeletionRecord {
  readonly id: string;
  readonly sourceId: string;
  readonly spaceId: string;
  readonly completedAt: Date | null;
}

export interface DeletionStore {
  request(input: DeletionRequest): Promise<RequestDeletionResult>;
  load(deletionId: string): Promise<DeletionRecord | null>;
  /** Conta mensagens e áudios guardados enquanto a fonte existir (numa reentrega já apagada, mantém o que havia). */
  recordCounts(deletionId: string): Promise<void>;
  /** Apaga a fonte; as FKs levam o resto. Limpa referências no estado das conversas com o agente. */
  deleteSource(deletionId: string, sourceId: string): Promise<void>;
  /** Conclui, audita e publica o aviso. `false` quando outra execução já concluiu. */
  complete(deletionId: string, objectsDeleted: number): Promise<boolean>;
}

export type RequestSourceDeletion = (input: DeletionRequest) => Promise<RequestDeletionResult>;

export function createRequestSourceDeletion(store: DeletionStore): RequestSourceDeletion {
  return (input) => store.request(input);
}
