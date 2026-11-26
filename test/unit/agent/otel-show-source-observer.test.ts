// T016 (feature 008, D-12): métrica do "mostra a N" sem conteúdo.
import { MeterProvider, MetricReader, type ResourceMetrics } from "@opentelemetry/sdk-metrics";
import { describe, expect, it } from "vitest";
import { createOtelShowSourceObserver } from "../../../src/modules/agent/index.js";

class TestReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

describe("métrica do 'mostra a N'", () => {
  it("conta por resultado e tipo, só com esses atributos", async () => {
    const reader = new TestReader();
    const observer = createOtelShowSourceObserver(new MeterProvider({ readers: [reader] }).getMeter("teste"));
    observer.shown("shown", "audio");
    observer.shown("shown", "audio");
    observer.shown("no_recent");
    const { resourceMetrics } = (await reader.collect()) as { resourceMetrics: ResourceMetrics };
    const points = resourceMetrics.scopeMetrics.flatMap((s) => s.metrics).find((m) => m.descriptor.name === "agent_show_source_total")?.dataPoints ?? [];
    expect(points.map((p) => ({ attributes: p.attributes, value: p.value }))).toEqual([
      { attributes: { outcome: "shown", kind: "audio" }, value: 2 },
      { attributes: { outcome: "no_recent" }, value: 1 },
    ]);
  });
});
