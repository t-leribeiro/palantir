// Preparar anexos (feature 005, D-02, D-03, RF-03, RF-04): o mesmo caminho para captura e importação.
// Confere a autorização antes de baixar (RN-01), baixa pela fetchRef com novas tentativas, calcula o
// SHA-256 e a duração, guarda cifrado endereçado pelo conteúdo e marca o anexo como stored ou unavailable.
import { createHash } from "node:crypto";
import {
  MediaUnavailableError,
  type CanonicalMessage,
  type MediaContent,
  type MediaUnavailableReason,
} from "../../../contracts/channel/knowledge-channel.js";
import { MAX_ATTACHMENT_BYTES, createMediaPolicy, isOggMime, mediaKindOfMime, type MediaKind } from "../domain/media-policy.js";
import { InvalidOggError, looksLikeOgg, oggOpusDuration } from "../domain/ogg-duration.js";
import type { ObjectStore } from "./ports.js";

type Attachment = CanonicalMessage["attachments"][number];

export type MediaFetch = (fetchRef: string) => Promise<MediaContent>;
export type PrepareAttachments = (message: CanonicalMessage, fetch: MediaFetch) => Promise<CanonicalMessage>;

/** A mesma consulta de autorização da ingestão: só fonte autorizada tem a mídia baixada. */
export interface SourceLookup {
  check(ref: { provider: string; accountId: string; conversationId: string }): Promise<
    { readonly status: "authorized"; readonly sourceId: string; readonly spaceId: string } | { readonly status: string }
  >;
}

/** Métricas da preparação (D-20): nada de conteúdo, só tipo e motivo. */
export interface PrepareObserver {
  stored(kind: MediaKind): void;
  unavailable(kind: MediaKind, reason: NonNullable<Attachment["unavailableReason"]>): void;
}

export interface PrepareAttachmentsDeps {
  readonly sources: SourceLookup;
  readonly store: ObjectStore;
  /** Tipos guardados (`PALANTIR_MEDIA_STORE_KINDS`); os demais ficam `unavailable/unsupported`. */
  readonly storeKinds: readonly string[];
  /** Esperas entre tentativas de download (padrão 1, 2 e 4 s). */
  readonly retryDelaysMs?: readonly number[];
  readonly sleep?: (ms: number) => Promise<void>;
  readonly observer?: PrepareObserver;
}

const DEFAULT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
const KIND_BY_MESSAGE: Partial<Record<CanonicalMessage["kind"], MediaKind>> = { audio: "audio", image: "image", document: "document" };

export function createPrepareAttachments(deps: PrepareAttachmentsDeps): PrepareAttachments {
  const policy = createMediaPolicy(deps.storeKinds);
  const delays = deps.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  async function download(fetch: MediaFetch, fetchRef: string): Promise<MediaContent | MediaUnavailableReason> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await fetch(fetchRef);
      } catch (error) {
        const reason = error instanceof MediaUnavailableError ? error.reason : "download_failed";
        const delay = delays[attempt];
        if (reason !== "download_failed" || delay === undefined) return reason;
        await sleep(delay);
      }
    }
  }

  async function prepareOne(attachment: Attachment, kind: MediaKind, target: Target, fetch: MediaFetch): Promise<Attachment> {
    if (!policy.stores(kind) || !attachment.fetchRef) return unavailable(attachment, "unsupported");
    const content = await download(fetch, attachment.fetchRef);
    if (typeof content === "string") return unavailable(attachment, content);
    if (content.bytes.length > MAX_ATTACHMENT_BYTES) return unavailable(attachment, "too_large");
    const sha256 = createHash("sha256").update(content.bytes).digest("hex");
    const storageKey = `${target.spaceId}/${target.sourceId}/${sha256}`;
    await deps.store.putIfAbsent(storageKey, content.bytes);
    const durationSeconds = durationOf(content, attachment);
    return {
      id: attachment.id,
      mimeType: attachment.mimeType,
      sizeBytes: content.bytes.length,
      status: "stored",
      storageKey,
      sha256,
      ...(durationSeconds === undefined ? {} : { durationSeconds }),
    };
  }

  async function observed(attachment: Attachment, kind: MediaKind, target: Target, fetch: MediaFetch): Promise<Attachment> {
    const prepared = await prepareOne(attachment, kind, target, fetch);
    if (prepared.status === "stored") deps.observer?.stored(kind);
    else if (prepared.unavailableReason) deps.observer?.unavailable(kind, prepared.unavailableReason);
    return prepared;
  }

  return async (message, fetch) => {
    const pending = message.attachments.filter((a) => a.status === undefined && a.fetchRef !== undefined);
    if (pending.length === 0) return message;
    const check = await deps.sources.check(message.source);
    if (!isAuthorized(check)) return message;
    const kind = KIND_BY_MESSAGE[message.kind];
    const attachments: Attachment[] = [];
    for (const a of message.attachments) {
      const isPending = a.status === undefined && a.fetchRef !== undefined;
      attachments.push(isPending ? await observed(a, kind ?? mediaKindOfMime(a.mimeType), check, fetch) : a);
    }
    return { ...message, attachments };
  };
}

interface Target {
  readonly sourceId: string;
  readonly spaceId: string;
}

function isAuthorized(check: { readonly status: string }): check is Target & { readonly status: "authorized" } {
  return check.status === "authorized";
}

function unavailable(attachment: Attachment, reason: MediaUnavailableReason): Attachment {
  return { id: attachment.id, mimeType: attachment.mimeType, status: "unavailable", unavailableReason: reason };
}

/** Duração do próprio Ogg quando possível (D-11); senão a informada pelo canal. Ogg ruim fica para o processador. */
function durationOf(content: MediaContent, attachment: Attachment): number | undefined {
  if (isOggMime(content.mimeType) || isOggMime(attachment.mimeType) || looksLikeOgg(content.bytes)) {
    try {
      return oggOpusDuration(content.bytes);
    } catch (error) {
      if (!(error instanceof InvalidOggError)) throw error;
    }
  }
  return attachment.durationSeconds;
}
