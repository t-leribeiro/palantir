import type { Queryable } from "../../../platform/db/index.js";
import type { InboundReceipts } from "../application/inbound-receipts.js";

export function createPgInboundReceipts(db: Queryable): InboundReceipts {
  return {
    async registerIfNew(provider, externalMessageId) {
      const { rowCount } = await db.query(
        `INSERT INTO agent_inbound_receipts (provider, external_message_id) VALUES ($1, $2)
         ON CONFLICT (provider, external_message_id) DO NOTHING`,
        [provider, externalMessageId],
      );
      return rowCount === 1;
    },
    async purgeOlderThan(cutoff) {
      const { rowCount } = await db.query("DELETE FROM agent_inbound_receipts WHERE received_at < $1", [cutoff]);
      return rowCount ?? 0;
    },
  };
}
