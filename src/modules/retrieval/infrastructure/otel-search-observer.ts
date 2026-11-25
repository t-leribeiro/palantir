// Métricas da busca combinada (feature 007, D-14): tempo de cada forma de busca e as degradações. Sem pergunta nem trecho.
import { metrics, type Meter } from "@opentelemetry/api";
import type { SearchObserver } from "../application/search-evidence.js";

export function createOtelSearchObserver(meter: Meter = metrics.getMeter("palantir")): SearchObserver {
  const duration = meter.createHistogram("search_strategy_seconds", { unit: "s", description: "Duração de cada forma de busca (lexical, typo, semantic, verifier)" });
  const degraded = meter.createCounter("search_degraded_total", { description: "Buscas que responderam sem o cálculo de sentido ou sem o verificador" });
  return {
    strategy: (name, seconds) => duration.record(seconds, { strategy: name }),
    degraded: (reason) => degraded.add(1, { reason }),
  };
}
