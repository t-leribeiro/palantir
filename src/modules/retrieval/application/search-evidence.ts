// Busca de evidências (S0) que, desde a feature 007, combina três formas de busca: palavra, palavra parecida e
// sentido (D-07). Cada uma filtra o espaço dentro da própria consulta (RN-02); a fusão ordena e a decisão por sinais
// diz o que citar (D-08). Sem o cálculo de sentido, a busca responde por palavra e marca `degraded` (D-09).
import { DomainError } from "../../../shared/index.js";
import type { Evidence } from "../domain/evidence.js";
import { decideEvidence, fuseRankings, type RankedList } from "../domain/fusion.js";

/** Restringe a busca a um tipo de mensagem (feature 005, emenda E001: só áudios). */
export type SearchKind = "audio";

/** Sentido da pergunta no modelo ativo, com o limiar dele (feature 007, D-06, D-08). */
export interface QueryVector {
  readonly vector: readonly number[];
  readonly modelId: string;
  readonly dimensions: number;
  readonly minSimilarity: number;
}

export interface SearchIndex {
  /** Palavra: busca restrita ao espaço, com o filtro dentro da própria consulta (RN-05). */
  search(spaceId: string, query: string, limit: number, kind?: SearchKind, sourceIds?: readonly string[]): Promise<Evidence[]>;
  /** Palavra parecida, por trigramas (feature 007, RF-04). */
  typo?(spaceId: string, query: string, limit: number, kind?: SearchKind, sourceIds?: readonly string[]): Promise<Evidence[]>;
  /** Sentido, no modelo ativo (feature 007, RF-02). */
  semantic?(spaceId: string, query: QueryVector, limit: number, kind?: SearchKind, sourceIds?: readonly string[]): Promise<Evidence[]>;
}

/** Calcula o sentido da pergunta; `null` quando não há modelo ativo. Falha lança (vira modo degradado). */
export interface QueryEmbedding {
  embedQuery(text: string, signal: AbortSignal): Promise<QueryVector | null>;
}

/** Candidata enviada ao verificador externo (feature 007, D-10; interfaces/verificador-externo.md §1). */
export interface VerifierCandidate {
  readonly id: string;
  readonly text: string;
  readonly author: string;
  readonly sourceTitle: string;
  readonly sentAt: string;
}

export interface EvidenceVerifier {
  readonly provider: string;
  /** Probabilidade de 0 a 1 de cada candidata sustentar a resposta; candidata sem resposta fica fora do mapa. */
  verify(question: string, candidates: readonly VerifierCandidate[], signal: AbortSignal): Promise<ReadonlyMap<string, number>>;
}

export type DegradedReason = "embedder" | "verifier";

/** Métricas da busca (D-14), sem texto: só a forma de busca, a duração e o motivo da degradação. */
export interface SearchObserver {
  strategy(name: "lexical" | "typo" | "semantic" | "verifier", seconds: number): void;
  degraded(reason: DegradedReason): void;
}

export interface SearchRequest {
  readonly spaceId: string;
  readonly query: string;
  readonly limit?: number;
  readonly kind?: SearchKind;
  /** Restringe a fontes do espaço (feature 006, RN-11: a pergunta cita o nome da conversa). */
  readonly sourceIds?: readonly string[];
}

export interface SearchResponse {
  readonly results: readonly Evidence[];
  readonly lowConfidence: boolean;
  /** Alguma forma de busca, ou o verificador, ficou de fora (feature 007, D-09). */
  readonly degraded: boolean;
}

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;
/** Candidatas de cada forma de busca (retrieval RF-02). */
export const CANDIDATES_PER_STRATEGY = 50;
export const QUERY_EMBED_TIMEOUT_MS = 1_500;
export const VERIFIER_CANDIDATES = 30;
export const VERIFIER_TIMEOUT_MS = 2_500;

export interface SearchDeps {
  readonly index: SearchIndex;
  readonly lowConfidenceThreshold: number;
  readonly queryEmbedding?: QueryEmbedding;
  readonly verifier?: { readonly verifier: EvidenceVerifier; readonly minProbability: number };
  readonly observer?: SearchObserver;
}

export type SearchEvidence = (request: SearchRequest) => Promise<SearchResponse>;

const NOOP_OBSERVER: SearchObserver = { strategy: () => undefined, degraded: () => undefined };

async function timed<T>(observer: SearchObserver, name: Parameters<SearchObserver["strategy"]>[0], work: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await work();
  } finally {
    observer.strategy(name, (performance.now() - started) / 1000);
  }
}

interface Ranked {
  readonly lists: RankedList[];
  readonly semanticMin: number | undefined;
  readonly degraded: boolean;
}

export function createSearchEvidence(deps: SearchDeps): SearchEvidence {
  const observer = deps.observer ?? NOOP_OBSERVER;

  async function semanticList(request: SearchRequest, query: string): Promise<{ list?: RankedList; min?: number; degraded: boolean }> {
    if (!deps.queryEmbedding || !deps.index.semantic) return { degraded: false };
    try {
      const vector = await deps.queryEmbedding.embedQuery(query, AbortSignal.timeout(QUERY_EMBED_TIMEOUT_MS));
      if (!vector) return { degraded: false };
      const results = await timed(observer, "semantic", () =>
        deps.index.semantic?.(request.spaceId, vector, CANDIDATES_PER_STRATEGY, request.kind, request.sourceIds) ?? Promise.resolve([]),
      );
      return { list: { strategy: "semantic", results }, min: vector.minSimilarity, degraded: false };
    } catch {
      observer.degraded("embedder");
      return { degraded: true };
    }
  }

  async function rank(request: SearchRequest, query: string): Promise<Ranked> {
    const { spaceId, kind, sourceIds } = request;
    const [lexical, typo, semantic] = await Promise.all([
      timed(observer, "lexical", () => deps.index.search(spaceId, query, CANDIDATES_PER_STRATEGY, kind, sourceIds)),
      deps.index.typo ? timed(observer, "typo", () => deps.index.typo?.(spaceId, query, CANDIDATES_PER_STRATEGY, kind, sourceIds) ?? Promise.resolve([])) : Promise.resolve([]),
      semanticList(request, query),
    ]);
    const lists: RankedList[] = [{ strategy: "lexical", results: lexical }, { strategy: "typo", results: typo }];
    if (semantic.list) lists.push(semantic.list);
    return { lists, semanticMin: semantic.min, degraded: semantic.degraded };
  }

  async function verified(query: string, fused: readonly Evidence[]): Promise<Evidence[] | undefined> {
    if (!deps.verifier || fused.length === 0) return undefined;
    const top = fused.slice(0, VERIFIER_CANDIDATES);
    const candidates = top.map((e) => ({ id: e.messageId, text: e.chunkText, author: e.author, sourceTitle: e.sourceTitle, sentAt: e.sentAt.toISOString() }));
    const { verifier, minProbability } = deps.verifier;
    const probabilities = await timed(observer, "verifier", () => verifier.verify(query, candidates, AbortSignal.timeout(VERIFIER_TIMEOUT_MS)));
    return top
      .map((e, position) => ({ e, position, p: probabilities.get(e.messageId) }))
      .filter((x): x is { e: Evidence; position: number; p: number } => x.p !== undefined && x.p >= minProbability)
      .sort((a, b) => b.p - a.p || a.position - b.position)
      .map((x) => x.e);
  }

  return async (request) => {
    if (request.spaceId.trim() === "") throw new DomainError("space_required", "Toda busca exige o espaço do usuário.");
    const query = request.query.trim();
    if (query === "") return { results: [], lowConfidence: true, degraded: false };
    const limit = Math.min(Math.max(request.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const ranked = await rank(request, query);
    const fused = fuseRankings(ranked.lists);
    try {
      const byVerifier = await verified(query, fused);
      if (byVerifier) return { results: byVerifier.slice(0, limit), lowConfidence: byVerifier.length === 0, degraded: ranked.degraded };
    } catch {
      observer.degraded("verifier");
      return decided(fused, ranked, deps.lowConfidenceThreshold, limit, true);
    }
    return decided(fused, ranked, deps.lowConfidenceThreshold, limit, ranked.degraded);
  };
}

function decided(fused: readonly Evidence[], ranked: Ranked, lexical: number, limit: number, degraded: boolean): SearchResponse {
  const { results, lowConfidence } = decideEvidence(fused, { lexical, semantic: ranked.semanticMin });
  return { results: results.slice(0, limit), lowConfidence, degraded };
}
