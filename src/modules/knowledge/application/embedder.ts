// Porta do cálculo de sentido (feature 007, D-01; interfaces/embedder-e-varredura.md §1). O núcleo nunca vê erro
// nem formato do fornecedor: trocar o motor local por um serviço online é escolher outro adaptador na composição.

export type EmbedPurpose = "document" | "query";

export interface Embedder {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  /** Um vetor normalizado (norma 1) por texto, na mesma ordem, com exatamente `dimensions` posições. */
  embed(texts: readonly string[], purpose: EmbedPurpose, signal?: AbortSignal): Promise<number[][]>;
  health(): Promise<boolean>;
}

export type EmbedderFailure = "unavailable" | "timeout" | "rate_limited" | "rejected" | "dimension_mismatch" | "model_mismatch";

/** Falha do cálculo, sem texto nem vetor: o chamador decide entre adiar (indexação) e degradar (busca). */
export class EmbedderError extends Error {
  constructor(readonly reason: EmbedderFailure) {
    super(`cálculo de sentido falhou: ${reason}`);
    this.name = "EmbedderError";
  }
}

/** Confere a quantidade e a dimensão antes de qualquer gravação (knowledge-indexing EC-05). */
export function checkVectors(vectors: readonly (readonly number[])[], expected: number, dimensions: number): void {
  if (vectors.length !== expected) throw new EmbedderError("rejected");
  if (vectors.some((v) => v.length !== dimensions)) throw new EmbedderError("dimension_mismatch");
}
