// T018 (feature 007, D-12): resumo do eval por tipo e por modo.
import { describe, expect, it } from "vitest";
import { exactRegressions, formatComparison, summarize, type CaseResult } from "../../../scripts/eval/summary.js";

const row = (id: string, type: CaseResult["type"], correct: boolean, outcome = correct === (type === "sem_evidencia") ? "no_evidence" : "answered"): CaseResult => ({
  id,
  type,
  correct,
  outcome,
  cited: outcome === "answered" ? 1 : 0,
});

describe("resumo do eval", () => {
  it("acertos por tipo, citação e não encontrei", () => {
    const s = summarize("combinada", [row("p01", "exata", true), row("q01", "parafrase", false), row("q02", "parafrase", true), row("n01", "sem_evidencia", true), row("n02", "sem_evidencia", false)]);
    expect(s.accuracy).toBeCloseTo(3 / 5, 10);
    expect(s.byType.parafrase).toEqual({ cases: 2, accuracy: 0.5 });
    expect(s.byType.digitacao).toEqual({ cases: 0, accuracy: 1 });
    expect(s.noEvidenceRate).toBe(0.5);
    expect(s.failures).toEqual(["q01", "n02"]);
  });

  it("RN-03: aponta a regressão de palavra exata", () => {
    expect(exactRegressions([row("p01", "exata", true), row("p02", "exata", false)], [row("p01", "exata", false), row("p02", "exata", true)])).toEqual(["p01"]);
  });

  it("a tabela traz um modo por coluna e as metas, sem texto de pergunta", () => {
    const table = formatComparison([summarize("palavra", [row("p01", "exata", true)]), summarize("combinada", [row("p01", "exata", true)])]);
    expect(table).toMatch(/Tipo\s+Casos\s+palavra\s+combinada/);
    expect(table).toContain("exata");
    expect(table).toContain("Metas: total ≥ 85.0%");
  });
});
