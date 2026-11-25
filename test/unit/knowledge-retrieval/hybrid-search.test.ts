// T015 e T016 (feature 007, D-07 a D-10): orquestração da busca combinada, com índice e cálculo de sentido falsos.
import { describe, expect, it } from "vitest";
import {
  CANDIDATES_PER_STRATEGY,
  createSearchEvidence,
  type Evidence,
  type EvidenceVerifier,
  type QueryEmbedding,
  type SearchIndex,
} from "../../../src/modules/retrieval/index.js";

const ev = (messageId: string, score: number): Evidence => ({ messageId, score, chunkText: messageId, author: "a", sourceTitle: "s", sentAt: new Date(0), kind: "text" });

function index(lists: { lexical?: Evidence[]; typo?: Evidence[]; semantic?: Evidence[] }, calls: string[] = []): SearchIndex {
  return {
    search: async (_s, _q, limit) => (calls.push(`lexical:${limit}`), lists.lexical ?? []),
    typo: async (_s, _q, limit) => (calls.push(`typo:${limit}`), lists.typo ?? []),
    semantic: async (_s, vector, limit, kind, sources) => (calls.push(`semantic:${vector.modelId}:${limit}:${kind ?? "-"}:${sources?.join(",") ?? "-"}`), lists.semantic ?? []),
  };
}

const embedding = (minSimilarity = 0.6): QueryEmbedding => ({
  embedQuery: async () => ({ vector: [1, 0], modelId: "11111111-1111-1111-1111-111111111111", dimensions: 2, minSimilarity }),
});

describe("busca combinada", () => {
  it("roda as três formas com os filtros, funde e cita quem passa no próprio sinal", async () => {
    const calls: string[] = [];
    const search = createSearchEvidence({
      index: index({ lexical: [ev("exata", 1)], typo: [ev("digitada", 1)], semantic: [ev("parafrase", 0.8), ev("vizinha", 0.3)] }, calls),
      lowConfidenceThreshold: 0.5,
      queryEmbedding: embedding(),
    });
    const response = await search({ spaceId: "s", query: "x", kind: "audio", sourceIds: ["t3"] });
    expect(response.lowConfidence).toBe(false);
    expect(response.degraded).toBe(false);
    expect(response.results.map((e) => e.messageId).sort()).toEqual(["digitada", "exata", "parafrase"]);
    expect(calls).toContain(`semantic:11111111-1111-1111-1111-111111111111:${CANDIDATES_PER_STRATEGY}:audio:t3`);
  });

  it("RN-04: só vizinhança fraca dá não encontrei", async () => {
    const search = createSearchEvidence({ index: index({ semantic: [ev("vizinha", 0.55)] }), lowConfidenceThreshold: 0.5, queryEmbedding: embedding(0.6) });
    expect(await search({ spaceId: "s", query: "kafka" })).toEqual({ results: [], lowConfidence: true, degraded: false });
  });

  it("D-09: cálculo de sentido fora do ar responde por palavra e marca degradado", async () => {
    const degraded: string[] = [];
    const search = createSearchEvidence({
      index: index({ lexical: [ev("exata", 1)], semantic: [ev("parafrase", 0.9)] }),
      lowConfidenceThreshold: 0.5,
      queryEmbedding: { embedQuery: async () => Promise.reject(new Error("fora do ar")) },
      observer: { strategy: () => undefined, degraded: (r) => void degraded.push(r), verifier: () => undefined },
    });
    const response = await search({ spaceId: "s", query: "x" });
    expect(response.results.map((e) => e.messageId)).toEqual(["exata"]);
    expect(response.degraded).toBe(true);
    expect(degraded).toEqual(["embedder"]);
  });

  it("sem modelo ativo, o sentido fica de fora sem degradar", async () => {
    const calls: string[] = [];
    const search = createSearchEvidence({ index: index({ lexical: [ev("exata", 1)] }, calls), lowConfidenceThreshold: 0.5, queryEmbedding: { embedQuery: async () => null } });
    expect((await search({ spaceId: "s", query: "x" })).degraded).toBe(false);
    expect(calls.some((c) => c.startsWith("semantic"))).toBe(false);
  });
});

describe("verificador externo", () => {
  const verifier = (p: Record<string, number>, seen: string[][] = []): EvidenceVerifier => ({
    provider: "fake",
    verify: async (_q, candidates) => (seen.push(candidates.map((c) => c.id)), new Map(Object.entries(p))),
  });

  it("D-10: cita as candidatas com p ≥ mínimo, por probabilidade; nenhuma dá não encontrei", async () => {
    const seen: string[][] = [];
    const lists = { lexical: [ev("a", 1), ev("b", 0.5)], semantic: [ev("c", 0.4)] };
    const search = createSearchEvidence({
      index: index(lists),
      lowConfidenceThreshold: 0.5,
      queryEmbedding: embedding(),
      verifier: { verifier: verifier({ a: 0.75, b: 0.2, c: 0.95 }, seen), minProbability: 0.7 },
    });
    const response = await search({ spaceId: "s", query: "x" });
    expect(response.results.map((e) => e.messageId)).toEqual(["c", "a"]);
    expect(seen[0]?.sort()).toEqual(["a", "b", "c"]);
    const none = createSearchEvidence({ index: index(lists), lowConfidenceThreshold: 0.5, verifier: { verifier: verifier({ a: 0.1 }), minProbability: 0.7 } });
    expect((await none({ spaceId: "s", query: "x" })).lowConfidence).toBe(true);
  });

  it("verificador fora do ar cai na decisão por sinais e marca degradado", async () => {
    const broken: EvidenceVerifier = { provider: "fake", verify: async () => Promise.reject(new Error("429")) };
    const search = createSearchEvidence({ index: index({ lexical: [ev("exata", 1)] }), lowConfidenceThreshold: 0.5, verifier: { verifier: broken, minProbability: 0.7 } });
    const response = await search({ spaceId: "s", query: "x" });
    expect(response.results.map((e) => e.messageId)).toEqual(["exata"]);
    expect(response.degraded).toBe(true);
  });

  it("conta o que o verificador decidiu, só números: aprovadas, recusadas, sem resposta e o efeito na resposta", async () => {
    const seen: unknown[] = [];
    const observer = { strategy: () => undefined, degraded: () => undefined, verifier: (r: unknown) => void seen.push(r) };
    const lists = { lexical: [ev("a", 1), ev("b", 0.5)], semantic: [ev("c", 0.4)] };
    const run = (p: Record<string, number>) =>
      createSearchEvidence({ index: index(lists), lowConfidenceThreshold: 0.5, queryEmbedding: embedding(), observer, verifier: { verifier: verifier(p), minProbability: 0.7 } })({ spaceId: "s", query: "x" });
    await run({ a: 0.75, b: 0.2, c: 0.95 });
    await run({ a: 0.1 });
    const broken: EvidenceVerifier = { provider: "fake", verify: async () => Promise.reject(new Error("429")) };
    await createSearchEvidence({ index: index(lists), lowConfidenceThreshold: 0.5, observer, verifier: { verifier: broken, minProbability: 0.7 } })({ spaceId: "s", query: "x" });
    expect(seen).toEqual([
      { outcome: "cited", approved: 2, rejected: 1, unanswered: 0 },
      { outcome: "nothing_found", approved: 0, rejected: 1, unanswered: 2 },
      { outcome: "failed" },
    ]);
  });
});
