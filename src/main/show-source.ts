// Composição do "mostra a N" (feature 008, ADR-0001): citações no estado curto, busca por contexto, serviço com
// trace e métrica, e o loader do arquivo do áudio para cada canal. Só o src/main liga portas e implementações.
import type { OutboundMediaLoader } from "../contracts/channel/knowledge-channel.js";
import { createOtelShowSourceObserver, createPgConversationState, createShowSource, type ShowSourceObserver } from "../modules/agent/index.js";
import { createLoadOutboundMedia, createPgOutboundMediaLookup } from "../modules/media/index.js";
import { createPgSourceContext } from "../modules/retrieval/index.js";
import type { AppConfig } from "../platform/config.js";
import type { Pool } from "../platform/db/index.js";
import type { Logger } from "../platform/logging/logger.js";
import { withSpan } from "../platform/telemetry/index.js";
import { buildObjectStore } from "./media.js";

let showSourceObserver: ShowSourceObserver | undefined;
/** Um instrumento por processo: a API e o WhatsApp montam o agente uma vez cada. */
const defaultObserver = () => (showSourceObserver ??= createOtelShowSourceObserver());

/** Dependência `showSource` do agente, com o span `agent.show_source` e a métrica, sem texto (D-12). */
export function buildShowSource(pool: Pool, observer: ShowSourceObserver = defaultObserver()) {
  const state = createPgConversationState(pool);
  const show = createShowSource({ citations: state, context: createPgSourceContext(pool), observer });
  return {
    citations: state,
    show: (...args: Parameters<typeof show>) => withSpan("agent.show_source", () => show(...args)),
  };
}

/**
 * Arquivo do áudio para o dono pelo canal `provider` (D-08). Sem chave de mídia ou sem armazenamento configurado,
 * não há loader: o canal entrega o texto de falha da resposta e a subida avisa no log.
 */
export function buildOutboundMedia(config: AppConfig, pool: Pool, provider: string, logger: Logger): OutboundMediaLoader | undefined {
  try {
    return createLoadOutboundMedia({ provider, lookup: createPgOutboundMediaLookup(pool), store: buildObjectStore(config.media) });
  } catch (error) {
    logger.warn({ reason: (error as Error).name }, "arquivo do áudio desligado no 'mostra a N': armazenamento de mídia não configurado");
    return undefined;
  }
}
