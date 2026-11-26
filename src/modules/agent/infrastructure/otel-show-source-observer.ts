// Métrica do "mostra a N" (feature 008, D-12): só o resultado e o tipo da mensagem, sem texto, ids ou nomes.
import { metrics, type Meter } from "@opentelemetry/api";
import type { ShowSourceObserver } from "../application/show-source.js";

export function createOtelShowSourceObserver(meter: Meter = metrics.getMeter("palantir")): ShowSourceObserver {
  const shown = meter.createCounter("agent_show_source_total", { description: "Pedidos de mensagem original (\"mostra a N\"), por resultado" });
  return { shown: (outcome, kind) => shown.add(1, { outcome, ...(kind ? { kind } : {}) }) };
}
