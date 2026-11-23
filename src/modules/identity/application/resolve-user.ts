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
