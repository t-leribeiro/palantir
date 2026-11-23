import type { Queryable } from "../../../platform/db/index.js";
import { WHATSAPP_PROVIDER, type WhatsAppAccountRepository, type WhatsAppAccountRow } from "../application/link-whatsapp-number.js";
import type { ChannelAccountStatus } from "../domain/identity.js";

interface Row {
  id: string;
  user_id: string;
  external_account_id: string;
  status: ChannelAccountStatus;
}

const COLUMNS = "id, user_id, external_account_id, status";

const toAccount = (row: Row | undefined): WhatsAppAccountRow | null =>
  row ? { id: row.id, userId: row.user_id, externalAccountId: row.external_account_id, status: row.status } : null;

export function createPgWhatsAppAccountRepository(db: Queryable): WhatsAppAccountRepository {
  return {
    async findByExternalId(externalAccountId) {
      const { rows } = await db.query<Row>(`SELECT ${COLUMNS} FROM channel_accounts WHERE provider = $1 AND external_account_id = $2`, [
        WHATSAPP_PROVIDER,
        externalAccountId,
      ]);
      return toAccount(rows[0]);
    },
    async findForUser(userId) {
      const { rows } = await db.query<Row>(
        `SELECT ${COLUMNS} FROM channel_accounts WHERE user_id = $1 AND provider = $2
          ORDER BY (status = 'active') DESC, verified_at NULLS LAST LIMIT 1`,
        [userId, WHATSAPP_PROVIDER],
      );
      return toAccount(rows[0]);
    },
    async activate(accountId, externalAccountId) {
      await db.query("UPDATE channel_accounts SET external_account_id = $2, status = 'active' WHERE id = $1", [accountId, externalAccountId]);
    },
    async create(userId, externalAccountId) {
      await db.query("INSERT INTO channel_accounts (user_id, provider, external_account_id, status) VALUES ($1, $2, $3, 'active')", [
        userId,
        WHATSAPP_PROVIDER,
        externalAccountId,
      ]);
    },
    async countSources(accountId) {
      const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM sources WHERE channel_account_id = $1", [accountId]);
      return rows[0]?.n ?? 0;
    },
  };
}
