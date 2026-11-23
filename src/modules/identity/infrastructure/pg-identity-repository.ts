import type { Queryable } from "../../../platform/db/index.js";
import type { AccountWithSpace, IdentityRepository } from "../application/resolve-user.js";
import type { ChannelAccountStatus } from "../domain/identity.js";

interface Row {
  id: string;
  user_id: string;
  provider: string;
  external_account_id: string;
  status: ChannelAccountStatus;
  space_id: string;
}

export function createPgIdentityRepository(db: Queryable): IdentityRepository {
  return {
    async findAccount(provider, externalAccountId): Promise<AccountWithSpace | null> {
      const { rows } = await db.query<Row>(
        `SELECT a.id, a.user_id, a.provider, a.external_account_id, a.status, s.id AS space_id
           FROM channel_accounts a
           JOIN knowledge_spaces s ON s.owner_user_id = a.user_id AND s.kind = 'personal'
          WHERE a.provider = $1 AND a.external_account_id = $2`,
        [provider, externalAccountId],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        account: {
          id: row.id,
          userId: row.user_id,
          provider: row.provider,
          externalAccountId: row.external_account_id,
          status: row.status,
        },
        personalSpaceId: row.space_id,
      };
    },
  };
}
