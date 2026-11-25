import { canIdentify, type ChannelAccount, type ResolvedUser } from "../domain/identity.js";

export interface AccountWithSpace {
  readonly account: ChannelAccount;
  /** Espaço pessoal do dono da conta. */
  readonly personalSpaceId: string;
}

export interface IdentityRepository {
  findAccount(provider: string, externalAccountId: string): Promise<AccountWithSpace | null>;
}

export type ResolveUserByChannelAccount = (provider: string, externalAccountId: string) => Promise<ResolvedUser | null>;

export function createResolveUserByChannelAccount(repo: IdentityRepository): ResolveUserByChannelAccount {
  return async (provider, externalAccountId) => {
    const found = await repo.findAccount(provider, externalAccountId);
    if (!found || !canIdentify(found.account)) return null;
    return { userId: found.account.userId, spaceId: found.personalSpaceId };
  };
}

/** Conta do remetente com o estado (feature 006, D-11, D-20): `pending` só pode mandar o código. */
export type AccountResolution =
  | { readonly status: "active"; readonly userId: string; readonly spaceId: string; readonly accountId: string }
  | { readonly status: "pending"; readonly userId: string; readonly accountId: string };

export type ResolveAccount = (provider: string, externalAccountId: string) => Promise<AccountResolution | null>;

export function createResolveAccount(repo: IdentityRepository): ResolveAccount {
  return async (provider, externalAccountId) => {
    const found = await repo.findAccount(provider, externalAccountId);
    if (!found) return null;
    const { account } = found;
    if (canIdentify(account)) return { status: "active", userId: account.userId, spaceId: found.personalSpaceId, accountId: account.id };
    if (account.status === "pending") return { status: "pending", userId: account.userId, accountId: account.id };
    return null;
  };
}
