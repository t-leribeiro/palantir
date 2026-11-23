import type { NewMessage } from "../domain/message.js";
import type { ReconcileDirection } from "../domain/reconcile.js";

export type SourceCheck =
  | { readonly status: "authorized"; readonly sourceId: string; readonly spaceId: string }
  | { readonly status: "not_authorized" }
  | { readonly status: "source_deleting" };

/** Consulta de autorização da fonte (implementada pelo módulo sources, ligada em src/main). */
export interface SourceAuthorization {
  check(ref: { provider: string; accountId: string; conversationId: string }): Promise<SourceCheck>;
}

export type InsertResult = { readonly status: "inserted"; readonly id: string } | { readonly status: "duplicate"; readonly id: string };

/** Mensagem que pode ser a mesma vinda pelo outro caminho (feature 004, D-09). */
export interface ReconcileRow {
  readonly id: string;
  readonly sentAt: Date;
  readonly authorName: string | undefined;
  readonly text: string;
}

export interface MessageStore {
  /** Grava a mensagem; se (fonte, id externo) já existir, devolve o id da existente sem gravar. */
  insert(message: NewMessage): Promise<InsertResult>;
  /** Id da mensagem que já tem a chave desta (id externo ou chave de importação), se houver. */
  findByKey(message: NewMessage): Promise<string | undefined>;
  /** Candidatas da mesma fonte no intervalo, sem a chave que falta e com texto; travadas até o fim da transação. */
  reconcileCandidates(query: {
    readonly sourceId: string;
    readonly direction: ReconcileDirection;
    readonly from: Date;
    readonly to: Date;
  }): Promise<readonly ReconcileRow[]>;
  /** Preenche a chave que faltava na mensagem existente e acrescenta a proveniência; o conteúdo não muda. */
  attachReconciled(messageId: string, message: NewMessage, direction: ReconcileDirection): Promise<void>;
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
