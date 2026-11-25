// Resumo do `npm run eval` por tipo de pergunta e por modo de busca (feature 007, D-12; interfaces/cli-medicao-e-config.md
// §4). Puro: recebe os acertos e devolve números e a tabela, sem texto de mensagem.

export const CASE_TYPES = ["exata", "parafrase", "digitacao", "sem_evidencia"] as const;
export type CaseType = (typeof CASE_TYPES)[number];
export const MODES = ["palavra", "combinada", "verificador"] as const;
export type Mode = (typeof MODES)[number];

export const TARGETS = { accuracy: 0.85, noEvidenceRate: 0.9, citationRate: 1 } as const;

export interface CaseResult {
  readonly id: string;
  readonly type: CaseType;
  readonly outcome: string;
  readonly correct: boolean;
  readonly cited: number;
}

export interface ModeSummary {
  readonly mode: Mode;
  readonly cases: number;
  readonly accuracy: number;
  readonly citationRate: number;
  readonly noEvidenceRate: number;
  readonly byType: Readonly<Record<CaseType, { readonly cases: number; readonly accuracy: number }>>;
  readonly failures: readonly string[];
}

const ratio = (n: number, d: number) => (d === 0 ? 1 : n / d);

export function summarize(mode: Mode, rows: readonly CaseResult[]): ModeSummary {
  const answered = rows.filter((r) => r.outcome === "answered");
  const negatives = rows.filter((r) => r.type === "sem_evidencia");
  const byType = Object.fromEntries(
    CASE_TYPES.map((type) => {
      const of = rows.filter((r) => r.type === type);
      return [type, { cases: of.length, accuracy: ratio(of.filter((r) => r.correct).length, of.length) }];
    }),
  ) as Record<CaseType, { cases: number; accuracy: number }>;
  return {
    mode,
    cases: rows.length,
    accuracy: ratio(rows.filter((r) => r.correct).length, rows.length),
    citationRate: ratio(answered.filter((r) => r.cited > 0).length, answered.length),
    noEvidenceRate: ratio(negatives.filter((r) => r.outcome === "no_evidence").length, negatives.length),
    byType,
    failures: rows.filter((r) => !r.correct).map((r) => r.id),
  };
}

/** Regressão do RN-03: algum caso `exata` que acertava na busca por palavra e errou no modo comparado. */
export function exactRegressions(baseline: readonly CaseResult[], other: readonly CaseResult[]): string[] {
  const ok = new Set(baseline.filter((r) => r.type === "exata" && r.correct).map((r) => r.id));
  return other.filter((r) => ok.has(r.id) && !r.correct).map((r) => r.id);
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function formatComparison(summaries: readonly ModeSummary[]): string {
  const head = ["Tipo".padEnd(15), "Casos".padStart(5), ...summaries.map((s) => s.mode.padStart(12))].join(" ");
  const lines = CASE_TYPES.map((type) =>
    [type.padEnd(15), String(summaries[0]?.byType[type].cases ?? 0).padStart(5), ...summaries.map((s) => pct(s.byType[type].accuracy).padStart(12))].join(" "),
  );
  const total = ["Total".padEnd(15), String(summaries[0]?.cases ?? 0).padStart(5), ...summaries.map((s) => pct(s.accuracy).padStart(12))].join(" ");
  const targets = `Metas: total ≥ ${pct(TARGETS.accuracy)}, sem_evidencia ≥ ${pct(TARGETS.noEvidenceRate)}, exata sem regressão, respostas citadas ${pct(TARGETS.citationRate)}.`;
  return [head, ...lines, total, targets].join("\n");
}
