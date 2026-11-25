// Fusão das formas de busca e decisão do "não encontrei" (feature 007, D-07, D-08; retrieval RF-02, RF-03, RF-08).
// O RRF só ordena: não diz se a primeira candidata é boa. Por isso a decisão olha os sinais absolutos de cada forma
// de busca, cada um contra o seu limiar, e só cita quem passa no próprio sinal.
import type { Evidence, EvidenceSignals } from "./evidence.js";

export type Strategy = keyof EvidenceSignals;

/** Resultado de uma forma de busca, na ordem dela; o `score` de cada evidência é o sinal daquela forma. */
export interface RankedList {
  readonly strategy: Strategy;
  readonly results: readonly Evidence[];
}

/** k do Reciprocal Rank Fusion (retrieval RF-03). */
export const RRF_K = 60;

interface Entry {
  evidence: Evidence;
  bestRank: number;
  rrf: number;
  signals: { lexical?: number; typo?: number; semantic?: number };
}

/**
 * Soma 1/(k + posição) de cada mensagem em cada lista, guarda o maior sinal por forma de busca e o trecho da posição
 * mais alta. Empate desempatado pelo id da mensagem: a mesma pergunta no mesmo índice dá a mesma ordem.
 */
export function fuseRankings(lists: readonly RankedList[], k = RRF_K): Evidence[] {
  const entries = new Map<string, Entry>();
  for (const list of lists) {
    const seen = new Set<string>();
    let rank = 0;
    for (const evidence of list.results) {
      if (seen.has(evidence.messageId)) continue;
      seen.add(evidence.messageId);
      rank += 1;
      const entry = entries.get(evidence.messageId) ?? { evidence, bestRank: rank, rrf: 0, signals: {} };
      entry.rrf += 1 / (k + rank);
      entry.signals[list.strategy] = Math.max(entry.signals[list.strategy] ?? Number.NEGATIVE_INFINITY, evidence.score);
      if (rank < entry.bestRank) Object.assign(entry, { evidence, bestRank: rank });
      entries.set(evidence.messageId, entry);
    }
  }
  return [...entries.values()]
    .sort((a, b) => b.rrf - a.rrf || a.evidence.messageId.localeCompare(b.evidence.messageId))
    .map((e) => ({ ...e.evidence, score: e.rrf, signals: e.signals }));
}

export interface DecisionThresholds {
  /** Fração mínima dos termos da pergunta (palavra exata e palavra parecida). */
  readonly lexical: number;
  /** Semelhança mínima de sentido do modelo ativo; sem ela, o sentido só ordena. */
  readonly semantic: number | undefined;
}

export function passes(evidence: Evidence, thresholds: DecisionThresholds): boolean {
  const s = evidence.signals ?? {};
  if ((s.lexical ?? 0) >= thresholds.lexical) return true;
  if ((s.typo ?? 0) >= thresholds.lexical) return true;
  return thresholds.semantic !== undefined && s.semantic !== undefined && s.semantic >= thresholds.semantic;
}

/** Só as evidências que passam no próprio sinal, na ordem da fusão; nenhuma = "não encontrei". */
export function decideEvidence(fused: readonly Evidence[], thresholds: DecisionThresholds): { results: Evidence[]; lowConfidence: boolean } {
  const results = fused.filter((e) => passes(e, thresholds));
  return { results, lowConfidence: results.length === 0 };
}
