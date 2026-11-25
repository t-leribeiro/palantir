// T019 (feature 007, D-13): métricas da medição dos modelos de embeddings.
import { describe, expect, it } from "vitest";
import { formatTable, metricsOf, prefixesFor, rankMessages, scoreQuestion, suggestThreshold } from "../../../scripts/busca/core.js";

describe("medição da busca pelo sentido", () => {
  it("ordena mensagens pelo melhor trecho e acha a posição da esperada", () => {
    const ranking = rankMessages([1, 0], [
      { messageId: "a", vector: [0.2, 0.98] },
      { messageId: "b", vector: [0.9, 0.44] },
      { messageId: "a", vector: [0.95, 0.31] },
    ]);
    expect(ranking.map((r) => r.messageId)).toEqual(["a", "b"]);
    expect(scoreQuestion(ranking, ["b"])).toEqual({ rank: 2, similarity: 0.9, expectsEvidence: true });
    expect(scoreQuestion(ranking, ["z"]).rank).toBeUndefined();
    expect(scoreQuestion(ranking, [])).toEqual({ rank: undefined, similarity: 0.95, expectsEvidence: false });
  });

  it("limiar sugerido deixa ≥ 90% das perguntas sem evidência abaixo dele", () => {
    const negatives = [0.31, 0.42, 0.44, 0.5, 0.52, 0.55, 0.57, 0.58, 0.6, 0.71];
    const tau = suggestThreshold(negatives) ?? 0;
    expect(negatives.filter((s) => s < tau).length / negatives.length).toBeGreaterThanOrEqual(0.9);
    expect(tau).toBe(0.61);
    expect(suggestThreshold([])).toBeUndefined();
  });

  it("Recall@k, MRR e positivos acima do limiar", () => {
    const m = metricsOf([
      { rank: 1, similarity: 0.8, expectsEvidence: true },
      { rank: 3, similarity: 0.55, expectsEvidence: true },
      { rank: undefined, similarity: 0, expectsEvidence: true },
      { rank: undefined, similarity: 0.5, expectsEvidence: false },
    ]);
    expect(m.recallAt1).toBeCloseTo(1 / 3, 10);
    expect(m.recallAt5).toBeCloseTo(2 / 3, 10);
    expect(m.mrr).toBeCloseTo((1 + 1 / 3) / 3, 10);
    expect(m.threshold).toBe(0.51);
    expect(m.positivesAboveThreshold).toBeCloseTo(2 / 3, 10);
  });

  it("prefixos por família e tabela só com números e nomes de modelo", () => {
    expect(prefixesFor("intfloat/multilingual-e5-base")).toEqual({ query: "query: ", document: "passage: " });
    expect(prefixesFor("BAAI/bge-m3")).toEqual({ query: "", document: "" });
    const table = formatTable([{ set: "real", model: "BAAI/bge-m3", dimensions: 1024, messagesPerSecond: 38.4, memoryBytes: 1.5 * 1024 ** 3, metrics: metricsOf([{ rank: 1, similarity: 0.7, expectsEvidence: true }]) }]);
    expect(table).toContain("BAAI/bge-m3");
    expect(table).toContain("1,5 GB");
  });
});
