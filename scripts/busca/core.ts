// Medição dos modelos de embeddings (feature 007, D-13; interfaces/cli-medicao-e-config.md §3). Funções puras: recebem
// vetores, ids e semelhanças, e devolvem números. Nenhuma recebe nem devolve texto de mensagem.

/** Candidatos iniciais, todos multilíngues e servidos pelo Text Embeddings Inference em CPU. */
export const DEFAULT_CANDIDATES = [
  "intfloat/multilingual-e5-small",
  "intfloat/multilingual-e5-base",
  "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
  "BAAI/bge-m3",
  "Qwen/Qwen3-Embedding-0.6B",
] as const;

/** Prefixos que cada família pede (a e5 separa pergunta e trecho; a Qwen3 pede uma instrução na pergunta). */
export function prefixesFor(model: string): { readonly query: string; readonly document: string } {
  const id = model.toLowerCase();
  if (id.startsWith("intfloat/multilingual-e5")) return { query: "query: ", document: "passage: " };
  if (id.startsWith("qwen/qwen3-embedding")) return { query: "Instruct: Given a question, retrieve chat messages that answer it\nQuery: ", document: "" };
  return { query: "", document: "" };
}

export function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

export interface Candidate {
  readonly messageId: string;
  readonly vector: readonly number[];
}

/** Mensagens por semelhança com a pergunta (o melhor trecho de cada mensagem), da maior para a menor. */
export function rankMessages(query: readonly number[], candidates: readonly Candidate[]): { readonly messageId: string; readonly similarity: number }[] {
  const best = new Map<string, number>();
  for (const c of candidates) best.set(c.messageId, Math.max(best.get(c.messageId) ?? Number.NEGATIVE_INFINITY, dot(query, c.vector)));
  return [...best.entries()].map(([messageId, similarity]) => ({ messageId, similarity })).sort((a, b) => b.similarity - a.similarity || a.messageId.localeCompare(b.messageId));
}

export interface QuestionScore {
  /** Posição (1 = primeira) da primeira mensagem esperada; `undefined` para pergunta sem evidência ou não achada. */
  readonly rank: number | undefined;
  /** Semelhança da mensagem esperada (com evidência) ou da mais parecida (sem evidência). */
  readonly similarity: number;
  readonly expectsEvidence: boolean;
}

export function scoreQuestion(ranking: readonly { messageId: string; similarity: number }[], expected: readonly string[]): QuestionScore {
  if (expected.length === 0) return { rank: undefined, similarity: ranking[0]?.similarity ?? 0, expectsEvidence: false };
  const position = ranking.findIndex((r) => expected.includes(r.messageId));
  return { rank: position < 0 ? undefined : position + 1, similarity: position < 0 ? 0 : (ranking[position]?.similarity ?? 0), expectsEvidence: true };
}

/** Menor limiar, em centésimos, que deixa ≥ `rate` das perguntas sem evidência abaixo dele. */
export function suggestThreshold(negativeSimilarities: readonly number[], rate = 0.9): number | undefined {
  if (negativeSimilarities.length === 0) return undefined;
  const sorted = [...negativeSimilarities].sort((a, b) => a - b);
  const keep = Math.ceil(rate * sorted.length);
  const limit = sorted[keep - 1] ?? 0;
  return Math.min(1, Math.floor(limit * 100) / 100 + 0.01);
}

export interface SetMetrics {
  readonly questions: number;
  readonly negatives: number;
  readonly recallAt1: number;
  readonly recallAt5: number;
  readonly recallAt10: number;
  readonly mrr: number;
  readonly threshold: number | undefined;
  /** Perguntas com evidência cuja mensagem esperada fica ≥ o limiar sugerido. */
  readonly positivesAboveThreshold: number;
}

export function metricsOf(scores: readonly QuestionScore[]): SetMetrics {
  const positives = scores.filter((s) => s.expectsEvidence);
  const negatives = scores.filter((s) => !s.expectsEvidence);
  const within = (k: number) => (positives.length === 0 ? 0 : positives.filter((s) => s.rank !== undefined && s.rank <= k).length / positives.length);
  const threshold = suggestThreshold(negatives.map((s) => s.similarity));
  return {
    questions: positives.length,
    negatives: negatives.length,
    recallAt1: within(1),
    recallAt5: within(5),
    recallAt10: within(10),
    mrr: positives.length === 0 ? 0 : positives.reduce((sum, s) => sum + (s.rank ? 1 / s.rank : 0), 0) / positives.length,
    threshold,
    positivesAboveThreshold: positives.length === 0 || threshold === undefined ? 0 : positives.filter((s) => s.similarity >= threshold).length / positives.length,
  };
}

export interface ModelRow {
  readonly set: "real" | "sintetico";
  readonly model: string;
  readonly dimensions: number;
  readonly metrics: SetMetrics;
  readonly messagesPerSecond: number;
  readonly memoryBytes: number | undefined;
}

const num = (n: number) => n.toFixed(2).replace(".", ",");
const pct = (n: number) => `${Math.round(n * 100)}%`;
const gb = (bytes: number | undefined) => (bytes === undefined ? "?" : `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} GB`);

export function formatTable(rows: readonly ModelRow[]): string {
  const head = ["Conjunto ", "Modelo".padEnd(58), "Dim ", "R@1 ", "R@5 ", "R@10", "MRR ", "Pos≥τ", "τ   ", "msg/s", "Memória"].join("  ");
  const lines = rows.map((r) =>
    [
      r.set.padEnd(9),
      r.model.padEnd(58),
      String(r.dimensions).padEnd(4),
      num(r.metrics.recallAt1),
      num(r.metrics.recallAt5),
      num(r.metrics.recallAt10),
      num(r.metrics.mrr),
      pct(r.metrics.positivesAboveThreshold).padEnd(5),
      r.metrics.threshold === undefined ? "–   " : num(r.metrics.threshold),
      String(Math.round(r.messagesPerSecond)).padEnd(5),
      gb(r.memoryBytes),
    ].join("  "),
  );
  return [head, ...lines].join("\n");
}
