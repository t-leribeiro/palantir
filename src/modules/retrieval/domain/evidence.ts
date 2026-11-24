/** Uma mensagem recuperada pela busca, com os metadados necessários para citá-la. */
export interface Evidence {
  readonly messageId: string;
  readonly chunkText: string;
  readonly score: number;
  readonly author: string;
  readonly sourceTitle: string;
  readonly sentAt: Date;
  readonly kind: string;
  /** Faixa do áudio de onde o trecho saiu e a duração do áudio (feature 005, RN-05). */
  readonly audioStartS?: number;
  readonly audioEndS?: number;
  readonly durationSeconds?: number;
}

/** Baixa confiança: nenhum resultado ou melhor score abaixo do limiar (RF-12). */
export function isLowConfidence(results: readonly Evidence[], threshold: number): boolean {
  const best = results.reduce((max, e) => Math.max(max, e.score), Number.NEGATIVE_INFINITY);
  return results.length === 0 || best < threshold;
}

/** Mantém só o melhor trecho de cada mensagem, preservando a ordem por score. */
export function bestPerMessage(results: readonly Evidence[]): Evidence[] {
  const byMessage = new Map<string, Evidence>();
  for (const e of results) {
    const current = byMessage.get(e.messageId);
    if (!current || e.score > current.score) byMessage.set(e.messageId, e);
  }
  return [...byMessage.values()].sort((a, b) => b.score - a.score);
}
