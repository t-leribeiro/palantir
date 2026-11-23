export type SourceStatus = "not_authorized" | "authorized" | "revoked" | "deleting";
export type SourceKind = "group" | "direct";

export interface Source {
  readonly id: string;
  readonly spaceId: string;
  readonly channelAccountId: string;
  readonly externalConversationId: string;
  readonly title: string;
  readonly kind: SourceKind;
  readonly status: SourceStatus;
}

export type IngestDecision =
  | { readonly status: "authorized"; readonly sourceId: string; readonly spaceId: string }
  | { readonly status: "not_authorized" }
  | { readonly status: "source_deleting" };

/** Opt-in por conversa: só fontes autorizadas aceitam mensagens (RN-01). */
export function decideIngestion(source: Source | null): IngestDecision {
  if (!source) return { status: "not_authorized" };
  if (source.status === "deleting") return { status: "source_deleting" };
  if (source.status !== "authorized") return { status: "not_authorized" };
  return { status: "authorized", sourceId: source.id, spaceId: source.spaceId };
}
