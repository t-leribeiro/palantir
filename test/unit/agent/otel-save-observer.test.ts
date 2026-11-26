// T022 (feature 009, D-18): métricas do guardar só com resultado, tipo e contagem.
import { MeterProvider, MetricReader, type ResourceMetrics } from "@opentelemetry/sdk-metrics";
import { describe, expect, it } from "vitest";
import { createOtelSaveObserver } from "../../../src/modules/agent/index.js";

class TestReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

describe("métricas do guardar", () => {
  it("contam por resultado e tipo, sem nenhum outro atributo", async () => {
    const reader = new TestReader();
    const observer = createOtelSaveObserver(new MeterProvider({ readers: [reader] }).getMeter("teste"));
    observer.saved("saved", "audio");
    observer.saved("saved", "audio");
    observer.saved("nothing_pending");
    observer.forwarded("noticed");
    observer.forwarded("discarded", 3);
    observer.listing("listed");
    const { resourceMetrics } = (await reader.collect()) as { resourceMetrics: ResourceMetrics };
    const all = resourceMetrics.scopeMetrics.flatMap((s) => s.metrics);
    const points = (name: string) => all.find((m) => m.descriptor.name === name)?.dataPoints.map((p) => ({ attributes: p.attributes, value: p.value })) ?? [];
    expect(points("agent_save_total")).toEqual([
      { attributes: { outcome: "saved", kind: "audio" }, value: 2 },
      { attributes: { outcome: "nothing_pending" }, value: 1 },
    ]);
    expect(points("agent_forwarded_total")).toEqual([
      { attributes: { outcome: "noticed" }, value: 1 },
      { attributes: { outcome: "discarded" }, value: 3 },
    ]);
    expect(points("agent_saved_listing_total")).toEqual([{ attributes: { outcome: "listed" }, value: 1 }]);
    const labels = all.flatMap((m) => m.dataPoints.flatMap((p) => Object.keys(p.attributes)));
    expect(new Set(labels)).toEqual(new Set(["outcome", "kind"]));
  });
});
