import { DomainError } from "../../../shared/index.js";
import { bestPerMessage, isLowConfidence, type Evidence } from "../domain/evidence.js";

export interface SearchIndex {
  /** Busca restrita ao espaço: o filtro vai dentro da própria consulta (RN-05). */
  search(spaceId: string, query: string, limit: number, kind?: SearchKind): Promise<Evidence[]>;
}

/** Restringe a busca a um tipo de mensagem (feature 005, emenda E001: só áudios). */
export type SearchKind = "audio";

export interface SearchRequest {
  readonly spaceId: string;
  readonly query: string;
  readonly limit?: number;
  readonly kind?: SearchKind;
}

export interface SearchResponse {
  readonly results: readonly Evidence[];
  readonly lowConfidence: boolean;
}

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;

export type SearchEvidence = (request: SearchRequest) => Promise<SearchResponse>;

export function createSearchEvidence(deps: { index: SearchIndex; lowConfidenceThreshold: number }): SearchEvidence {
  return async ({ spaceId, query, limit = DEFAULT_LIMIT, kind }) => {
    if (spaceId.trim() === "") throw new DomainError("space_required", "Toda busca exige o espaço do usuário.");
    const trimmed = query.trim();
    if (trimmed === "") return { results: [], lowConfidence: true };
    const raw = await deps.index.search(spaceId, trimmed, Math.min(Math.max(limit, 1), MAX_LIMIT), kind);
    const results = bestPerMessage(raw);
    return { results, lowConfidence: isLowConfidence(results, deps.lowConfidenceThreshold) };
  };
}
