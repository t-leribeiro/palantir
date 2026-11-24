import { withTransaction, type Pool } from "../../../platform/db/index.js";
import type { LiveVerification, VerificationRepository } from "../application/verify-account.js";

interface Row {
  id: string;
  code_salt: Buffer;
  code_hash: Buffer;
  expires_at: Date;
  attempts: number;
}

const LIVE = "consumed_at IS NULL AND invalidated_at IS NULL";

export function createPgVerificationRepository(pool: Pool): VerificationRepository {
  return {
    async issue(accountId, salt, hash, expiresAt) {
      await withTransaction(pool, async (db) => {
        await db.query(`UPDATE channel_account_verifications SET invalidated_at = now() WHERE account_id = $1 AND ${LIVE}`, [accountId]);
        await db.query(
          "INSERT INTO channel_account_verifications (account_id, code_salt, code_hash, expires_at) VALUES ($1, $2, $3, $4)",
          [accountId, Buffer.from(salt), Buffer.from(hash), expiresAt],
        );
      });
    },
    async live(accountId): Promise<LiveVerification | null> {
      const { rows } = await pool.query<Row>(
        `SELECT id, code_salt, code_hash, expires_at, attempts FROM channel_account_verifications WHERE account_id = $1 AND ${LIVE}`,
        [accountId],
      );
      const row = rows[0];
      return row ? { id: row.id, salt: row.code_salt, hash: row.code_hash, expiresAt: new Date(row.expires_at), attempts: row.attempts } : null;
    },
    async recordFailure(verificationId, maxAttempts) {
      const { rows } = await pool.query<{ attempts: number }>(
        `UPDATE channel_account_verifications
            SET attempts = attempts + 1,
                invalidated_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE invalidated_at END
          WHERE id = $1 RETURNING attempts`,
        [verificationId, maxAttempts],
      );
      return rows[0]?.attempts ?? maxAttempts;
    },
    async consume(verificationId, accountId) {
      return withTransaction(pool, async (db) => {
        const { rowCount } = await db.query(`UPDATE channel_account_verifications SET consumed_at = now() WHERE id = $1 AND ${LIVE}`, [verificationId]);
        if (rowCount !== 1) return false;
        await db.query("UPDATE channel_accounts SET status = 'active', verified_at = now() WHERE id = $1", [accountId]);
        return true;
      });
    },
  };
}
