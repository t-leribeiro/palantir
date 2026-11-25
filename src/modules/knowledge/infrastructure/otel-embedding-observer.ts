// Métricas do cálculo de sentido (feature 007, D-14). Atributos nunca levam texto nem vetor: só o resultado e o motor.
import { metrics, type Meter } from "@opentelemetry/api";
import type { EmbeddingObserver } from "../application/embed-chunks.js";

export interface OtelEmbeddingObserver extends EmbeddingObserver {
  embedderUp(up: boolean, provider: string): void;
}

export function createOtelEmbeddingObserver(meter: Meter = metrics.getMeter("palantir")): OtelEmbeddingObserver {
  const items = meter.createCounter("embedding_items_total", { description: "Trechos com o sentido calculado (embedded) ou adiados para a varredura (deferred)" });
  const duration = meter.createHistogram("embedding_seconds", { unit: "s", description: "Duração de um lote de cálculo de sentido" });
  const activations = meter.createCounter("embedding_model_activations_total", { description: "Trocas de modelo de embeddings concluídas" });
  let pending = 0;
  const up = new Map<string, number>();
  meter.createObservableGauge("embedding_pending", { description: "Trechos sem o sentido calculado no modelo ativo" }).addCallback((r) => r.observe(pending));
  meter.createObservableGauge("embedder_up", { description: "1 quando o cálculo de sentido responde" }).addCallback((r) => {
    for (const [provider, value] of up) r.observe(value, { provider });
  });
  return {
    items(outcome, count, seconds) {
      items.add(count, { outcome });
      if (seconds !== undefined) duration.record(seconds);
    },
    pending: (count) => void (pending = count),
    activated: () => activations.add(1),
    embedderUp: (value, provider) => void up.set(provider, value ? 1 : 0),
  };
}
