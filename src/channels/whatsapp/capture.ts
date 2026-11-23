// Captura de grupos autorizados (feature 004: RN-01, RN-07, RN-10; D-05, D-11 a D-13). Uma mensagem de grupo
// só vira CanonicalMessage `live` quando o grupo tem captura ativa, é posterior à autorização e é texto.
// O destino é a fonte autorizada (ex.: `export:t3`), então a ingestão resolve a fonte como sempre.
import type { CanonicalMessage, IngestOutcome, InboundHandler } from "../../contracts/channel/knowledge-channel.js";
import { CONTRACT_VERSION } from "../../contracts/channel/knowledge-channel.js";
import { validateCanonicalMessage } from "../../platform/contracts/validator.js";
import { maskPhone, type Clock, type IdGenerator } from "../../shared/index.js";
import type { DirectKind, GroupInfo, IncomingGroupMessage } from "./provider/provider.js";

/** Rota de um grupo com captura ativa (porta implementada por `sources`, ligada em `src/main`). */
export interface CaptureRouteRef {
  readonly provider: string;
  readonly accountId: string;
  readonly conversationId: string;
  readonly authorizedAt: Date;
}

export interface CapturePorts {
  route(groupId: string): Promise<CaptureRouteRef | null>;
  syncGroups(groups: readonly GroupInfo[], complete: boolean): Promise<void>;
  /** Grupos conhecidos do número, para `listConversations`. */
  knownGroups(): Promise<readonly { readonly groupId: string; readonly subject: string }[]>;
}

export type CaptureDiscardReason = "not_authorized" | "before_authorization" | "media" | "direct" | "invalid";

/** Eventos para métricas (D-16). Nunca recebem texto, número, nome de pessoa nem de grupo. */
export interface CaptureObserver {
  captured(outcome: IngestOutcome["outcome"]): void;
  captureDiscarded(reason: CaptureDiscardReason): void;
  captureIgnoredMedia(kind: DirectKind): void;
}

export const UNKNOWN_PARTICIPANT = "Participante";
const MAX_NAME = 200;

/** Nome exibido nas citações (RN-10): nome de perfil; sem ele, o número mascarado; sem número, "Participante". */
export function participantDisplayName(message: Pick<IncomingGroupMessage, "senderName" | "senderPhone">): string {
  const name = message.senderName?.trim();
  if (name) return name.slice(0, MAX_NAME);
  return message.senderPhone ? maskPhone(message.senderPhone) : UNKNOWN_PARTICIPANT;
}

/** Identidade estável do autor na fonte: E.164; sem número, o LID (`lid:<id>`). */
export function participantExternalId(message: Pick<IncomingGroupMessage, "senderPhone" | "senderLid">): string {
  return message.senderPhone ?? message.senderLid ?? "lid:desconhecido";
}

export function toLiveCanonical(message: IncomingGroupMessage, route: CaptureRouteRef, deps: { readonly ids: IdGenerator; readonly clock: Clock; readonly adapter: string }): unknown {
  return {
    contractVersion: CONTRACT_VERSION,
    id: deps.ids(),
    source: { provider: route.provider, accountId: route.accountId, conversationId: route.conversationId, externalMessageId: message.id },
    sender: { externalId: participantExternalId(message), displayName: participantDisplayName(message) },
    timestamp: message.sentAt.toISOString(),
    kind: "text",
    text: message.text,
    isForwarded: false,
    attachments: [],
    provenance: { captureMethod: "live", capturedAt: deps.clock.now().toISOString(), adapter: deps.adapter },
  };
}

export interface GroupCaptureDeps {
  readonly ports: CapturePorts;
  readonly observer: CaptureObserver;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly adapter: string;
  readonly inbound: () => InboundHandler | undefined;
  readonly onError: () => void;
}

/** Filtros na ordem da regra: autorização, corte da autorização, tipo; depois contrato e ingestão. */
export function createGroupCapture(deps: GroupCaptureDeps) {
  async function routeOf(message: IncomingGroupMessage): Promise<CaptureRouteRef | null> {
    const route = await deps.ports.route(message.groupId);
    if (!route) deps.observer.captureDiscarded("not_authorized");
    else if (message.sentAt.getTime() < route.authorizedAt.getTime()) {
      deps.observer.captureDiscarded("before_authorization");
      return null;
    }
    return route;
  }

  function isText(message: IncomingGroupMessage): boolean {
    if (message.kind === "text" && message.text) return true;
    deps.observer.captureDiscarded("media");
    deps.observer.captureIgnoredMedia(message.kind);
    return false;
  }

  async function ingest(message: CanonicalMessage): Promise<void> {
    const handler = deps.inbound();
    if (!handler) return;
    deps.observer.captured((await handler(message)).outcome);
  }

  return async (message: IncomingGroupMessage): Promise<void> => {
    try {
      const route = await routeOf(message);
      if (!route || !isText(message)) return;
      const valid = validateCanonicalMessage(toLiveCanonical(message, route, deps));
      if (!valid.ok) {
        deps.observer.captureDiscarded("invalid");
        return;
      }
      await ingest(valid.value);
    } catch {
      deps.onError();
    }
  };
}
