import type { Queryable } from "../../../platform/db/index.js";
import { assertCountsOnly, type AuditChannel, type AuditEntry, type AuditEvent, type AuditLog } from "../application/audit.js";

/** Grava um evento no client dado: dentro de uma transação, entra junto com a mudança auditada. */
export async function insertAuditEvent(db: Queryable, event: AuditEvent): Promise<void> {
  assertCountsOnly(event.details);
  await db.query(
    "INSERT INTO audit_events (actor_user_id, action, target_kind, target_id, channel, details) VALUES ($1, $2, $3, $4, $5, $6)",
    [event.actorUserId, event.action, event.targetKind, event.targetId, event.channel ?? null, JSON.stringify(event.details ?? {})],
  );
}

interface Row {
  actor_user_id: string | null;
  action: AuditEntry["action"];
  target_kind: AuditEntry["targetKind"];
  target_id: string;
  channel: AuditChannel | null;
  details: Record<string, number>;
  at: Date;
  label: string | null;
}

export function createPgAuditLog(db: Queryable): AuditLog {
  return {
    record: (event) => insertAuditEvent(db, event),
    async list({ since, limit }) {
      const { rows } = await db.query<Row>(
        `SELECT e.actor_user_id, e.action, e.target_kind, e.target_id, e.channel, e.details, e.at,
                CASE e.target_kind WHEN 'source' THEN s.title ELSE a.external_account_id END AS label
           FROM audit_events e
           LEFT JOIN sources s ON e.target_kind = 'source' AND s.id = e.target_id
           LEFT JOIN channel_accounts a ON e.target_kind = 'channel_account' AND a.id = e.target_id
          WHERE ($1::timestamptz IS NULL OR e.at >= $1)
          ORDER BY e.at DESC
          LIMIT $2`,
        [since ?? null, limit],
      );
      return rows.map((r) => ({
        actorUserId: r.actor_user_id,
        action: r.action,
        targetKind: r.target_kind,
        targetId: r.target_id,
        channel: r.channel,
        details: r.details,
        at: new Date(r.at),
        targetLabel: r.label,
      }));
    },
  };
}
