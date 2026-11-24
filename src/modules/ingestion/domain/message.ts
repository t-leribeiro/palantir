import type { CanonicalMessage } from "../../../contracts/channel/knowledge-channel.js";

export type CaptureMethod = CanonicalMessage["provenance"]["captureMethod"];
export type MessageKind = CanonicalMessage["kind"];

/** Mensagem original como evidência imutável (RN-03): o que é gravado nunca é alterado. */
export interface NewMessage {
  readonly id: string;
  readonly spaceId: string;
  readonly sourceId: string;
  readonly externalMessageId: string | undefined;
  /** Chave determinística de mensagens importadas (contrato 1.1.0); deduplica reimportações (RN-02 da S1). */
  readonly importKey: string | undefined;
  readonly sender: { readonly externalId: string; readonly displayName: string | undefined };
  readonly kind: MessageKind;
  readonly text: string | undefined;
  readonly sentAt: Date;
  readonly isForwarded: boolean;
  readonly quotedExternalMessageId: string | undefined;
  readonly provenance: { readonly captureMethod: CaptureMethod; readonly adapter: string; readonly capturedAt: Date };
  /** Primeiro anexo preparado; o WhatsApp manda um arquivo por mensagem. */
  readonly attachment: NewAttachment | undefined;
}

/** Tipo do anexo (feature 005, RN-10): escolhe o processador. */
export type AttachmentKind = "audio" | "image" | "document" | "video" | "other";

/** Anexo já preparado pelo módulo media (status preenchido) e gravado junto da mensagem (feature 005). */
export interface NewAttachment {
  readonly mediaKind: AttachmentKind;
  readonly mimeType: string;
  readonly sizeBytes: number | undefined;
  readonly sha256: string | undefined;
  readonly storageKey: string | undefined;
  readonly durationSeconds: number | undefined;
  readonly storageStatus: "stored" | "unavailable";
  readonly unavailableReason: string | undefined;
}

export interface IngestTarget {
  readonly sourceId: string;
  readonly spaceId: string;
}

export function toNewMessage(message: CanonicalMessage, target: IngestTarget, id: string): NewMessage {
  return {
    id,
    spaceId: target.spaceId,
    sourceId: target.sourceId,
    externalMessageId: message.source.externalMessageId,
    importKey: message.source.importKey,
    sender: { externalId: message.sender.externalId, displayName: message.sender.displayName },
    kind: message.kind,
    text: message.text,
    sentAt: new Date(message.timestamp),
    isForwarded: message.isForwarded,
    quotedExternalMessageId: message.quotedExternalMessageId,
    provenance: {
      captureMethod: message.provenance.captureMethod,
      adapter: message.provenance.adapter,
      capturedAt: new Date(message.provenance.capturedAt),
    },
    attachment: toNewAttachment(message),
  };
}

const ATTACHMENT_KIND: Partial<Record<MessageKind, AttachmentKind>> = { audio: "audio", image: "image", document: "document" };

function toNewAttachment(message: CanonicalMessage): NewAttachment | undefined {
  const a = message.attachments.find((x) => x.status !== undefined);
  if (!a?.status) return undefined;
  return {
    mediaKind: ATTACHMENT_KIND[message.kind] ?? "other",
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    sha256: a.sha256,
    storageKey: a.storageKey,
    durationSeconds: a.durationSeconds,
    storageStatus: a.status,
    unavailableReason: a.unavailableReason,
  };
}

/** Anexo anunciado (com fetchRef) que não passou pela preparação: o núcleo prepara antes de ingerir. */
export const hasUnpreparedAttachment = (message: CanonicalMessage): boolean =>
  message.attachments.some((a) => a.fetchRef !== undefined && a.status === undefined);
