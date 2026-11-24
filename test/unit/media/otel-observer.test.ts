// T020 (feature 005, D-20): métricas da mídia, sem texto, nome de arquivo nem telefone nos atributos.
import { MeterProvider, MetricReader, type ResourceMetrics } from "@opentelemetry/sdk-metrics";
import { describe, expect, it } from "vitest";
import { createOtelMediaObserver } from "../../../src/modules/media/infrastructure/otel-observer.js";

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

function setup() {
  const reader = new TestReader();
  const provider = new MeterProvider({ readers: [reader] });
  return { reader, observer: createOtelMediaObserver(provider.getMeter("teste")) };
}

describe("createOtelMediaObserver", () => {
  it("conta guardados, indisponíveis, processados e falhas por tipo, resultado e motivo", async () => {
    const { reader, observer } = setup();
    observer.stored("audio");
    observer.stored("audio");
    observer.unavailable("audio", "download_failed");
    observer.processed("audio", "done");
    observer.processed("audio", "failed", { reason: "corrupted" });
    const m = await collect(reader);
    expect(m.get("media_stored_total")).toEqual([{ attributes: { kind: "audio" }, value: 2 }]);
    expect(m.get("media_unavailable_total")).toEqual([{ attributes: { kind: "audio", reason: "download_failed" }, value: 1 }]);
    expect(m.get("media_processed_total")).toEqual([
      { attributes: { kind: "audio", outcome: "done" }, value: 1 },
      { attributes: { kind: "audio", outcome: "failed" }, value: 1 },
    ]);
    expect(m.get("media_failed_total")).toEqual([{ attributes: { kind: "audio", reason: "corrupted" }, value: 1 }]);
  });

  it("registra o fator de tempo real por modelo e a latência; ignora valores ausentes", async () => {
    const { reader, observer } = setup();
    observer.transcribed({ model: "Systran/faster-whisper-small", rtf: 0.3, latencySeconds: 42 });
    observer.transcribed({ model: "Systran/faster-whisper-small", rtf: null, latencySeconds: null });
    const m = await collect(reader);
    const rtf = m.get("transcription_rtf")?.[0];
    expect(rtf?.attributes).toEqual({ model: "Systran/faster-whisper-small" });
    expect((rtf?.value as { count: number }).count).toBe(1);
    expect((m.get("transcription_latency_seconds")?.[0]?.value as { sum: number }).sum).toBe(42);
  });

  it("expõe o motor no ar e o tamanho da fila", async () => {
    const { reader, observer } = setup();
    observer.transcriberUp(true, "openai-compatible");
    observer.queueSize("audio", 158);
    let m = await collect(reader);
    expect(m.get("transcriber_up")).toEqual([{ attributes: { engine: "openai-compatible" }, value: 1 }]);
    expect(m.get("media_queue_size")).toEqual([{ attributes: { kind: "audio" }, value: 158 }]);
    observer.transcriberUp(false, "openai-compatible");
    m = await collect(reader);
    expect(m.get("transcriber_up")?.[0]?.value).toBe(0);
  });
});
