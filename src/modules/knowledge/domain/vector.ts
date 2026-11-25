// Operações sobre vetores de sentido (feature 007). Puras: o núcleo compara e normaliza sem conhecer o motor.

/** Vetor de norma 1 (D-01): o cosseno fica comparável entre fornecedores. Vetor nulo continua nulo. */
export function normalize(vector: readonly number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  return norm === 0 ? vector.map(() => 0) : vector.map((x) => x / norm);
}

/** Semelhança de cosseno de dois vetores da mesma dimensão (0 quando algum é nulo). */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new RangeError("vetores de dimensões diferentes");
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}
