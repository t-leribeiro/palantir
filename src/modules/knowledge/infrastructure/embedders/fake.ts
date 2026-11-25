// Embedder falso e determinístico para testes (feature 007, D-11; interfaces/embedder-e-varredura.md §4): sem rede
// nem modelo. Cada palavra que começa por um termo de um conceito soma no eixo desse conceito; as demais somam num
// eixo derivado do hash. Assim "baratear" e "reduzir o custo" ficam próximos quando o léxico os junta.
import { normalize } from "../../domain/vector.js";
import { EmbedderError, type EmbedPurpose, type Embedder } from "../../application/embedder.js";

/** Conceito → prefixos de palavra (sem acento, minúsculas) que o representam. */
export type ConceptLexicon = Readonly<Record<string, readonly string[]>>;

export interface FakeEmbedderOptions {
  readonly dimensions?: number;
  readonly concepts?: ConceptLexicon;
  /** Simula o motor fora do ar (testes de modo degradado). */
  readonly down?: () => boolean;
}

export const FAKE_EMBEDDER_PROVIDER = "fake";
const MIN_WORD = 3;
/** Palavras sem assunto, fora do vetor para não aproximar mensagens só por elas. */
const STOPWORDS = new Set(["para", "que", "com", "dos", "das", "uma", "por", "nos", "nas", "quem", "algo", "alguem", "falou", "falaram", "sobre", "qual", "foi", "mas", "nao", "sim", "ele", "ela"]);

export function createFakeEmbedder(options: FakeEmbedderOptions = {}): Embedder {
  const concepts = Object.entries(options.concepts ?? {});
  const dimensions = options.dimensions ?? Math.max(64, concepts.length * 2);
  if (concepts.length >= dimensions) throw new RangeError("o léxico precisa de menos conceitos que dimensões");
  const free = dimensions - concepts.length;

  function axisOf(word: string): number {
    const concept = concepts.findIndex(([, prefixes]) => prefixes.some((p) => word.startsWith(p)));
    if (concept >= 0) return concept;
    let hash = 0;
    for (const ch of word) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return concepts.length + (hash % free);
  }

  function vectorOf(text: string): number[] {
    const vector = new Array<number>(dimensions).fill(0);
    for (const word of words(text)) vector[axisOf(word)] = (vector[axisOf(word)] ?? 0) + 1;
    return normalize(vector);
  }

  return {
    provider: FAKE_EMBEDDER_PROVIDER,
    model: "fake-concepts",
    dimensions,
    async embed(texts: readonly string[], _purpose: EmbedPurpose) {
      if (options.down?.()) throw new EmbedderError("unavailable");
      return texts.map(vectorOf);
    },
    async health() {
      return !options.down?.();
    },
  };
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= MIN_WORD && !STOPWORDS.has(w));
}
