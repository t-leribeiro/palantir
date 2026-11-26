// Métricas do guardar (feature 009, D-18): só resultado, tipo e contagem. O tema é conteúdo do dono e nunca vira
// rótulo; nada de texto, ids, nomes ou telefones.
import { metrics, type Meter } from "@opentelemetry/api";
import type { SaveObserver } from "../application/save-content.js";
import type { SavedListingObserver } from "../application/saved-listing.js";

export type OtelSaveObserver = SaveObserver & SavedListingObserver;

export function createOtelSaveObserver(meter: Meter = metrics.getMeter("palantir")): OtelSaveObserver {
  const saved = meter.createCounter("agent_save_total", { description: "Itens de pedidos de guardar, por resultado e tipo" });
  const listing = meter.createCounter("agent_saved_listing_total", { description: "Listagens de guardados, por resultado" });
  const forwarded = meter.createCounter("agent_forwarded_total", { description: "Conteúdo encaminhado ao agente, pelo que aconteceu com ele" });
  return {
    saved: (outcome, kind) => saved.add(1, { outcome, ...(kind ? { kind } : {}) }),
    forwarded: (outcome, count = 1) => forwarded.add(count, { outcome }),
    listing: (outcome) => listing.add(1, { outcome }),
  };
}
