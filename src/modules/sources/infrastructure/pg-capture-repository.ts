// Autorizações de captura em PostgreSQL (feature 004, D-04, D-05). Histórico: revogar marca revoked_at;
// o índice único parcial garante uma captura ativa por grupo, inclusive em corrida entre dois comandos.
import type { Queryable } from "../../../platform/db/index.js";
import { DomainError } from "../../../shared/index.js";
import type { CaptureRecord, CaptureRepository, CaptureRoute } from "../application/capture-authorization.js";

const UNIQUE_VIOLATION = "23505";

export function createPgCaptureRepository(db: Queryable): CaptureRepository {
  return {
    async latestByGroup(provider): Promise<readonly CaptureRecord[]> {
      const { rows } = await db.query<{ group_id: string; source_id: string; title: string; authorized_at: Date; revoked_at: Date | null }>(
        `SELECT DISTINCT ON (c.group_id) c.group_id, c.source_id, s.title, c.authorized_at, c.revoked_at
           FROM source_captures c JOIN sources s ON s.id = c.source_id
          WHERE c.provider = $1
          ORDER BY c.group_id, c.authorized_at DESC, c.id DESC`,
        [provider],
      );
      return rows.map((r) => ({
        groupId: r.group_id,
        sourceId: r.source_id,
        sourceTitle: r.title,
        authorizedAt: new Date(r.authorized_at),
        revokedAt: r.revoked_at ? new Date(r.revoked_at) : null,
      }));
    },

    async route(provider, groupId): Promise<CaptureRoute | null> {
      const { rows } = await db.query<{ provider: string; external_account_id: string; external_conversation_id: string; source_id: string; authorized_at: Date }>(
        `SELECT a.provider, a.external_account_id, s.external_conversation_id, c.source_id, c.authorized_at
           FROM source_captures c
           JOIN sources s ON s.id = c.source_id
           JOIN channel_accounts a ON a.id = s.channel_account_id
          WHERE c.provider = $1 AND c.group_id = $2 AND c.revoked_at IS NULL`,
        [provider, groupId],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        provider: row.provider,
        accountId: row.external_account_id,
        conversationId: row.external_conversation_id,
        sourceId: row.source_id,
        authorizedAt: new Date(row.authorized_at),
      };
    },

    async findOwnedSource(userId, provider, conversationId) {
      const { rows } = await db.query<{ id: string; title: string }>(
        `SELECT s.id, s.title
           FROM sources s JOIN channel_accounts a ON a.id = s.channel_account_id
          WHERE a.user_id = $1 AND a.provider = $2 AND s.external_conversation_id = $3 AND s.status <> 'deleting'`,
        [userId, provider, conversationId],
      );
      const row = rows[0];
      return row ? { sourceId: row.id, title: row.title } : null;
    },

    async create(input) {
      try {
        const { rows } = await db.query<{ authorized_at: Date }>(
          `INSERT INTO source_captures (source_id, provider, group_id, authorized_by, consent_statement)
           VALUES ($1, $2, $3, $4, $5) RETURNING authorized_at`,
          [input.sourceId, input.provider, input.groupId, input.authorizedBy, input.consent],
        );
        return { authorizedAt: new Date(rows[0]?.authorized_at ?? Date.now()) };
      } catch (error) {
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
          throw new DomainError("already_authorized", "O grupo já está autorizado. Para trocar a fonte, revogue e autorize de novo.");
        }
        throw error;
      }
    },

    async revoke(provider, groupId, at) {
      const result = await db.query(
        "UPDATE source_captures SET revoked_at = $3 WHERE provider = $1 AND group_id = $2 AND revoked_at IS NULL",
        [provider, groupId, at],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}
