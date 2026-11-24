// T022 (feature 006, D-16): métricas da gestão de fontes, sem nome de grupo, telefone nem texto nos atributos.
import { MeterProvider, MetricReader, type ResourceMetrics } from "@opentelemetry/sdk-metrics";
import { describe, expect, it } from "vitest";
import { createOtelManagementObserver } from "../../../src/modules/sources/index.js";

class TestReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

type Point = { attributes: Record<string, unknown>; value: unknown };

async function collect(reader: TestReader): Promise<Map<string, Point[]>> {
  const { resourceMetrics } = (await reader.collect()) as { resourceMetrics: ResourceMetrics };
  const out = new Map<string, Point[]>();
  for (const scope of resourceMetrics.scopeMetrics) {
    for (const metric of scope.metrics) out.set(metric.descriptor.name, metric.dataPoints.map((p) => ({ attributes: p.attributes, value: p.value })));
  }
  return out;
}

describe("createOtelManagementObserver", () => {
  it("comandos por tipo, itens apagados por tipo, exclusões em andamento e avisos por resultado", async () => {
    const reader = new TestReader();
    const observer = createOtelManagementObserver(new MeterProvider({ readers: [reader] }).getMeter("teste"));
    observer.command("list");
    observer.command("list");
    observer.command("delete");
    observer.deletionCompleted(42, { messages: 3, audios: 1, objects: 1 });
    observer.deletionsInProgress(2, 1900);
    observer.notification("sent");
    observer.notification("duplicate");
    const m = await collect(reader);
    expect(m.get("agent_commands_total")).toEqual([
      { attributes: { command: "list" }, value: 2 },
      { attributes: { command: "delete" }, value: 1 },
    ]);
    expect(m.get("source_deletion_items_total")).toEqual([
      { attributes: { kind: "messages" }, value: 3 },
      { attributes: { kind: "audios" }, value: 1 },
      { attributes: { kind: "objects" }, value: 1 },
    ]);
    expect(m.get("source_deletions_in_progress")).toEqual([{ attributes: {}, value: 2 }]);
    expect(m.get("source_deletion_oldest_seconds")).toEqual([{ attributes: {}, value: 1900 }]);
    expect(m.get("agent_notifications_total")).toEqual([
      { attributes: { outcome: "sent" }, value: 1 },
      { attributes: { outcome: "duplicate" }, value: 1 },
    ]);
    expect(m.get("source_deletion_seconds")?.[0]?.attributes).toEqual({});
  });
});
