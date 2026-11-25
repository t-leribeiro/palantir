// T021 (feature 007, D-14): métricas do cálculo de sentido e da busca, sem texto nos atributos.
import { describe, expect, it } from "vitest";
import type { Meter } from "@opentelemetry/api";
import { createOtelEmbeddingObserver } from "../../../src/modules/knowledge/index.js";
import { createOtelSearchObserver } from "../../../src/modules/retrieval/index.js";

function fakeMeter() {
  const recorded: { name: string; value: number; attrs?: Record<string, unknown> }[] = [];
  const gauges = new Map<string, (r: { observe: (v: number, a?: Record<string, unknown>) => void }) => void>();
  const instrument = (name: string) => ({
    add: (value: number, attrs?: Record<string, unknown>) => void recorded.push({ name, value, ...(attrs ? { attrs } : {}) }),
    record: (value: number, attrs?: Record<string, unknown>) => void recorded.push({ name, value, ...(attrs ? { attrs } : {}) }),
  });
  const meter = {
    createCounter: instrument,
    createHistogram: instrument,
    createObservableGauge: (name: string) => ({ addCallback: (cb: (r: { observe: (v: number) => void }) => void) => void gauges.set(name, cb) }),
  } as unknown as Meter;
  const observe = (name: string) => {
    const values: { value: number; attrs?: Record<string, unknown> }[] = [];
    gauges.get(name)?.({ observe: (value, attrs) => void values.push({ value, ...(attrs ? { attrs } : {}) }) });
    return values;
  };
  return { meter, recorded, observe };
}

describe("observadores da busca pelo sentido", () => {
  it("contagens, duração, pendentes, trocas e saúde do motor", () => {
    const { meter, recorded, observe } = fakeMeter();
    const o = createOtelEmbeddingObserver(meter);
    o.items("embedded", 32, 0.4);
    o.items("deferred", 2);
    o.pending(7);
    o.activated();
    o.embedderUp(false, "openai-compatible");
    expect(recorded).toEqual([
      { name: "embedding_items_total", value: 32, attrs: { outcome: "embedded" } },
      { name: "embedding_seconds", value: 0.4 },
      { name: "embedding_items_total", value: 2, attrs: { outcome: "deferred" } },
      { name: "embedding_model_activations_total", value: 1 },
    ]);
    expect(observe("embedding_pending")).toEqual([{ value: 7 }]);
    expect(observe("embedder_up")).toEqual([{ value: 0, attrs: { provider: "openai-compatible" } }]);
  });

  it("tempo por forma de busca e degradação pelo motivo", () => {
    const { meter, recorded } = fakeMeter();
    const o = createOtelSearchObserver(meter);
    o.strategy("semantic", 0.12);
    o.degraded("embedder");
    expect(recorded).toEqual([
      { name: "search_strategy_seconds", value: 0.12, attrs: { strategy: "semantic" } },
      { name: "search_degraded_total", value: 1, attrs: { reason: "embedder" } },
    ]);
  });
});
