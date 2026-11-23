export type ChannelAccountStatus = "pending" | "active" | "revoked";
export type KnowledgeSpaceKind = "personal" | "shared";

export interface ChannelAccount {
  readonly id: string;
  readonly userId: string;
  readonly provider: string;
  readonly externalAccountId: string;
  readonly status: ChannelAccountStatus;
}

export interface KnowledgeSpace {
  readonly id: string;
  readonly ownerUserId: string;
  readonly kind: KnowledgeSpaceKind;
}

/** Usuário e espaço resolvidos a partir de uma conta de canal ativa. */
export interface ResolvedUser {
  readonly userId: string;
  readonly spaceId: string;
}

/** Só contas ativas (verificadas) identificam um usuário (RF-09 de identity-and-sources). */
export function canIdentify(account: Pick<ChannelAccount, "status">): boolean {
  return account.status === "active";
}
