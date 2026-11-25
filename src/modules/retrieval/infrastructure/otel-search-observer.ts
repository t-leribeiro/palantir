// Métricas da busca combinada (feature 007, D-14): tempo de cada forma de busca, as degradações e o que o verificador
// decidiu. Sem pergunta nem trecho: só contagens.
import { metrics, type Meter } from "@opentelemetry/api";
import type { SearchObserver } from "../application/search-evidence.js";

const JUDGMENTS = ["approved", "rejected", "unanswered"] as const;

export function createOtelSearchObserver(meter: Meter = metrics.getMeter("palantir")): SearchObserver {
  const duration = meter.createHistogram("search_strategy_seconds", { unit: "s", description: "Duração de cada forma de busca (lexical, typo, semantic, verifier)" });
  const degraded = meter.createCounter("search_degraded_total", { description: "Buscas que responderam sem o cálculo de sentido ou sem o verificador" });
  const calls = meter.createCounter("verifier_calls_total", { description: "Perguntas julgadas pelo verificador: cited (citou alguma), nothing_found (recusou todas) ou failed" });
  const candidates = meter.createCounter("verifier_candidates_total", { description: "Candidatas julgadas pelo verificador: approved, rejected ou unanswered" });
  return {
    strategy: (name, seconds) => duration.record(seconds, { strategy: name }),
    degraded: (reason) => degraded.add(1, { reason }),
    verifier: (result) => {
      calls.add(1, { outcome: result.outcome });
      if (result.outcome === "failed") return;
      for (const outcome of JUDGMENTS) if (result[outcome] > 0) candidates.add(result[outcome], { outcome });
    },
  };
}
