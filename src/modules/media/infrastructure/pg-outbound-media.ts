// Anexo guardado do espaço da conta de destino (feature 008, data-delta.md §2): a conta precisa estar ativa no
// canal, e o anexo, guardado e no espaço pessoal dela.
import type { Queryable } from "../../../platform/db/index.js";
import type { OutboundMediaLookup } from "../application/load-outbound-media.js";

const FIND = `
SELECT a.storage_key, a.mime_type, a.sha256
  FROM channel_accounts ca
  JOIN knowledge_spaces s ON s.owner_user_id = ca.user_id AND s.kind = 'personal'
  JOIN attachments a ON a.space_id = s.id
 WHERE ca.provider = $1 AND ca.external_account_id = $2 AND ca.status = 'active'
   AND a.id = $3 AND a.storage_status = 'stored'`;

export function createPgOutboundMediaLookup(db: Queryable): OutboundMediaLookup {
  return {
    async find(provider, externalAccountId, attachmentId) {
      const { rows } = await db.query<{ storage_key: string; mime_type: string; sha256: string }>(FIND, [provider, externalAccountId, attachmentId]);
      const row = rows[0];
      return row ? { storageKey: row.storage_key, mimeType: row.mime_type, sha256: row.sha256 } : null;
    },
  };
}
