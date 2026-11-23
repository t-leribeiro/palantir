import type { NewMessage } from "../domain/message.js";

export type SourceCheck =
  | { readonly status: "authorized"; readonly sourceId: string; readonly spaceId: string }
  | { readonly status: "not_authorized" }
  | { readonly status: "source_deleting" };

/** Consulta de autorização da fonte (implementada pelo módulo sources, ligada em src/main). */
export interface SourceAuthorization {
  check(ref: { provider: string; accountId: string; conversationId: string }): Promise<SourceCheck>;
}

export type InsertResult = { readonly status: "inserted"; readonly id: string } | { readonly status: "duplicate"; readonly id: string };

export interface MessageStore {
  /** Grava a mensagem; se (fonte, id externo) já existir, devolve o id da existente sem gravar. */
  insert(message: NewMessage): Promise<InsertResult>;
}

export interface IndexJob {
  readonly messageId: string;
  readonly spaceId: string;
  readonly reason: "ingested";
}

export interface IndexJobs {
  enqueueIndex(job: IndexJob): Promise<void>;
}

/** Tudo o que roda dentro de uma transação: gravação e enfileiramento juntos (ADR-0003). */
export interface IngestionTx {
  readonly messages: MessageStore;
  readonly jobs: IndexJobs;
}

export interface UnitOfWork {
  run<T>(work: (tx: IngestionTx) => Promise<T>): Promise<T>;
}
