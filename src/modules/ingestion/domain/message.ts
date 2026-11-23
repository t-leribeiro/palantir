import type { CanonicalMessage } from "../../../contracts/channel/knowledge-channel.js";

export type CaptureMethod = CanonicalMessage["provenance"]["captureMethod"];
export type MessageKind = CanonicalMessage["kind"];

/** Mensagem original como evidência imutável (RN-03): o que é gravado nunca é alterado. */
export interface NewMessage {
  readonly id: string;
  readonly spaceId: string;
  readonly sourceId: string;
  readonly externalMessageId: string | undefined;
  readonly sender: { readonly externalId: string; readonly displayName: string | undefined };
  readonly kind: MessageKind;
  readonly text: string | undefined;
  readonly sentAt: Date;
  readonly isForwarded: boolean;
  readonly quotedExternalMessageId: string | undefined;
  readonly provenance: { readonly captureMethod: CaptureMethod; readonly adapter: string; readonly capturedAt: Date };
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
  };
}
