// Taxa de erro de palavras (WER) para a medição dos modelos (feature 005, RF-11, D-19).
// A mesma normalização vale para todos os modelos: só comparações feitas assim são justas.

const UNCLEAR = /\[\?\]/g;

/** NFC, minúsculas, sem pontuação, espaços colapsados; trechos marcados `[?]` saem da conta. */
export function normalizeForWer(text: string): string[] {
  return text
    .normalize("NFC")
    .replace(UNCLEAR, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w !== "");
}

export interface WerCount {
  /** Substituições + inserções + remoções. */
  readonly errors: number;
  /** Palavras da referência. */
  readonly words: number;
}

/** Distância de edição por palavras entre a referência e a hipótese. */
export function werCount(reference: string, hypothesis: string): WerCount {
  const ref = normalizeForWer(reference);
  const hyp = normalizeForWer(hypothesis);
  let previous = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= hyp.length; j += 1) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    previous = current;
  }
  return { errors: previous[hyp.length] ?? 0, words: ref.length };
}

/** WER agregado de um conjunto: soma dos erros sobre a soma das palavras (não a média das taxas). */
export function aggregateWer(counts: readonly WerCount[]): number {
  const words = counts.reduce((n, c) => n + c.words, 0);
  if (words === 0) return 0;
  return counts.reduce((n, c) => n + c.errors, 0) / words;
}
