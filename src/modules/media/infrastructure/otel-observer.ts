// Métricas da mídia (feature 005, D-20, interfaces/job-media-process.md §4). Atributos nunca levam texto,
// nome de arquivo nem telefone: só tipo, resultado, motivo, modelo e motor.
import { metrics, type Meter } from "@opentelemetry/api";
import type { MediaKind } from "../domain/media-policy.js";
import type { MediaObserver } from "../application/process-attachment.js";
import type { PrepareObserver } from "../application/prepare-attachments.js";

export interface OtelMediaObserver extends MediaObserver, PrepareObserver {
  transcriberUp(up: boolean, engine: string): void;
  queueSize(kind: MediaKind, size: number): void;
}

export function createOtelMediaObserver(meter: Meter = metrics.getMeter("palantir")): OtelMediaObserver {
  const stored = meter.createCounter("media_stored_total", { description: "Anexos guardados (cifrados) por tipo" });
  const unavailable = meter.createCounter("media_unavailable_total", { description: "Anexos indisponíveis por tipo e motivo" });
  const processed = meter.createCounter("media_processed_total", { description: "Anexos processados por tipo e resultado" });
  const failed = meter.createCounter("media_failed_total", { description: "Falhas de processamento por tipo e motivo" });
  const rtf = meter.createHistogram("transcription_rtf", { description: "Fator de tempo real da transcrição (tempo / duração)" });
  const latency = meter.createHistogram("transcription_latency_seconds", { unit: "s", description: "Da chegada do áudio ao fim da transcrição" });
  const up = new Map<string, number>();
  const queue = new Map<MediaKind, number>();
  meter.createObservableGauge("transcriber_up", { description: "1 quando o motor de transcrição responde" }).addCallback((result) => {
    for (const [engine, value] of up) result.observe(value, { engine });
  });
  meter.createObservableGauge("media_queue_size", { description: "Anexos esperando processamento, por tipo" }).addCallback((result) => {
    for (const [kind, value] of queue) result.observe(value, { kind });
  });
  return {
    stored: (kind) => stored.add(1, { kind }),
    unavailable: (kind, reason) => unavailable.add(1, { kind, reason }),
    processed(kind, outcome, details) {
      processed.add(1, { kind, outcome });
      if (outcome === "failed") failed.add(1, { kind, reason: details?.reason ?? "unknown" });
    },
    transcribed({ model, rtf: value, latencySeconds }) {
      if (value !== null) rtf.record(value, { model });
      if (latencySeconds !== null) latency.record(latencySeconds);
    },
    transcriberUp: (value, engine) => void up.set(engine, value ? 1 : 0),
    queueSize: (kind, size) => void queue.set(kind, size),
  };
}
