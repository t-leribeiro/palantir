// T013 (feature 007, D-07, D-08): fusão por posição e decisão por sinais.
import { describe, expect, it } from "vitest";
import { RRF_K, decideEvidence, fuseRankings, type Evidence } from "../../../src/modules/retrieval/index.js";

const ev = (messageId: string, score: number, chunkText = "t"): Evidence => ({
  messageId,
  score,
  chunkText,
  author: "a",
  sourceTitle: "s",
  sentAt: new Date(0),
  kind: "text",
});

describe("fusão das formas de busca", () => {
  it("soma 1/(k + posição) e ordena; quem aparece em mais listas sobe", () => {
    const fused = fuseRankings([
      { strategy: "lexical", results: [ev("m1", 1), ev("m2", 0.5)] },
      { strategy: "semantic", results: [ev("m2", 0.9), ev("m3", 0.8)] },
    ]);
    expect(fused.map((e) => e.messageId)).toEqual(["m2", "m1", "m3"]);
    expect(fused[0]?.score).toBeCloseTo(1 / (RRF_K + 2) + 1 / (RRF_K + 1), 12);
    expect(fused[0]?.signals).toEqual({ lexical: 0.5, semantic: 0.9 });
  });

  it("uma mensagem com vários trechos conta uma vez por lista, com o maior sinal e o trecho da melhor posição", () => {
    const fused = fuseRankings([
      { strategy: "semantic", results: [ev("m1", 0.7, "melhor"), ev("m1", 0.6, "outro"), ev("m2", 0.5)] },
      { strategy: "lexical", results: [ev("m2", 1)] },
    ]);
    const m1 = fused.find((e) => e.messageId === "m1");
    expect(m1?.chunkText).toBe("melhor");
    expect(m1?.signals).toEqual({ semantic: 0.7 });
    expect(fused.find((e) => e.messageId === "m2")?.score).toBeCloseTo(1 / (RRF_K + 2) + 1 / (RRF_K + 1), 12);
  });

  it("RF-03: empate desempatado pelo id; mesma entrada, mesma saída", () => {
    const lists = [
      { strategy: "lexical" as const, results: [ev("b", 1)] },
      { strategy: "semantic" as const, results: [ev("a", 1)] },
    ];
    expect(fuseRankings(lists).map((e) => e.messageId)).toEqual(["a", "b"]);
    expect(fuseRankings(lists)).toEqual(fuseRankings(lists));
  });
});

describe("decisão do não encontrei", () => {
  const thresholds = { lexical: 0.5, semantic: 0.6 };

  it("D-08: cita só quem passa no próprio sinal, na ordem da fusão", () => {
    const fused = fuseRankings([
      { strategy: "lexical", results: [ev("exata", 1), ev("fraca", 0.25)] },
      { strategy: "typo", results: [ev("digitada", 0.5)] },
      { strategy: "semantic", results: [ev("parafrase", 0.72), ev("vizinha", 0.41)] },
    ]);
    const { results, lowConfidence } = decideEvidence(fused, thresholds);
    expect(lowConfidence).toBe(false);
    expect(results.map((e) => e.messageId).sort()).toEqual(["digitada", "exata", "parafrase"]);
  });

  it("RN-04: semelhança fraca não vira resposta; sem limiar de sentido, o sentido só ordena", () => {
    const fused = fuseRankings([{ strategy: "semantic", results: [ev("vizinha", 0.55)] }]);
    expect(decideEvidence(fused, thresholds)).toEqual({ results: [], lowConfidence: true });
    expect(decideEvidence(fuseRankings([{ strategy: "semantic", results: [ev("m", 0.99)] }]), { lexical: 0.5, semantic: undefined }).lowConfidence).toBe(true);
    expect(decideEvidence([], thresholds).lowConfidence).toBe(true);
  });
});
