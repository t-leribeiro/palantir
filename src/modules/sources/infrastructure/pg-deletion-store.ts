import { withTransaction, type Pool, type PoolClient } from "../../../platform/db/index.js";
import type { JobQueue } from "../../../platform/queue/index.js";
import { DELETION_NOTICE_QUEUE, SOURCE_DELETE_QUEUE, noticeQueueFor, type SourceDeleteJob } from "../domain/deletion.js";
import type { DeletionRecord, DeletionRequest, DeletionStore, RequestDeletionResult } from "../application/request-deletion.js";
import { insertAuditEvent } from "./pg-audit-log.js";

interface SourceRow {
  title: string;
  status: string;
}

async function insertDeletion(db: PoolClient, input: DeletionRequest, title: string): Promise<string> {
  const notify = input.notify;
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO source_deletions (source_id, space_id, requested_by, notify_provider, notify_account, notify_title)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.sourceId, input.spaceId, input.requestedBy, notify ? notify.provider : null, notify ? notify.accountId : null, notify ? title : null],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error("o banco não devolveu o id do pedido de exclusão");
  return id;
}

async function requestIn(db: PoolClient, queue: JobQueue, input: DeletionRequest): Promise<RequestDeletionResult> {
  const { rows } = await db.query<SourceRow>("SELECT title, status FROM sources WHERE id = $1 AND space_id = $2 FOR UPDATE", [input.sourceId, input.spaceId]);
  const source = rows[0];
  if (!source) return { outcome: "not_found" };
  const title = input.title ?? source.title;
  if (source.status === "deleting") return { outcome: "already_deleting", title };
  await db.query("UPDATE sources SET status = 'deleting' WHERE id = $1", [input.sourceId]);
  await db.query("UPDATE source_captures SET revoked_at = now() WHERE source_id = $1 AND revoked_at IS NULL", [input.sourceId]);
  const deletionId = await insertDeletion(db, input, title);
  await insertAuditEvent(db, { actorUserId: input.requestedBy, action: "source.deletion_requested", targetKind: "source", targetId: input.sourceId, channel: input.channel });
  const job: SourceDeleteJob = { deletionId, sourceId: input.sourceId, spaceId: input.spaceId };
  await queue.sendInTransaction(db, SOURCE_DELETE_QUEUE, job, { singletonKey: deletionId });
  return { outcome: "requested", deletionId, title };
}

interface CompletedRow {
  source_id: string;
  messages_deleted: number | null;
  audios_deleted: number | null;
  objects_deleted: number;
  notify_account: string | null;
  notify_provider: string | null;
}

async function completeIn(db: PoolClient, queue: JobQueue, notifyQueue: string, deletionId: string, objects: number): Promise<boolean> {
  const { rows } = await db.query<CompletedRow>(
    `UPDATE source_deletions SET completed_at = now(), objects_deleted = COALESCE(objects_deleted, 0) + $2
      WHERE id = $1 AND completed_at IS NULL
      RETURNING source_id, messages_deleted, audios_deleted, objects_deleted, notify_account, notify_provider`,
    [deletionId, objects],
  );
  const row = rows[0];
  if (!row) return false;
  const details = { messages: row.messages_deleted ?? 0, audios: row.audios_deleted ?? 0, objects: row.objects_deleted };
  await insertAuditEvent(db, { actorUserId: null, action: "source.deleted", targetKind: "source", targetId: row.source_id, details });
  if (row.notify_account && row.notify_provider) {
    await queue.sendInTransaction(db, noticeQueueFor(notifyQueue, row.notify_provider), { kind: "source_deleted", deletionId }, { singletonKey: deletionId });
  }
  return true;
}

/** Exclusão em duas etapas no PostgreSQL (D-07, D-08). `notifyQueue` é a fila do aviso consumida pelo canal. */
export function createPgDeletionStore(pool: Pool, queue: JobQueue, notifyQueue: string = DELETION_NOTICE_QUEUE): DeletionStore {
  return {
    request: (input) => withTransaction(pool, (db) => requestIn(db, queue, input)),
    async load(deletionId): Promise<DeletionRecord | null> {
      const { rows } = await pool.query<{ id: string; source_id: string; space_id: string; completed_at: Date | null }>(
        "SELECT id, source_id, space_id, completed_at FROM source_deletions WHERE id = $1",
        [deletionId],
      );
      const row = rows[0];
      return row ? { id: row.id, sourceId: row.source_id, spaceId: row.space_id, completedAt: row.completed_at } : null;
    },
    async recordCounts(deletionId) {
      await pool.query(
        `UPDATE source_deletions d
            SET messages_deleted = (SELECT count(*) FROM messages m WHERE m.source_id = d.source_id),
                audios_deleted = (SELECT count(*) FROM attachments a
                                   WHERE a.source_id = d.source_id AND a.media_kind = 'audio' AND a.storage_status = 'stored')
          WHERE d.id = $1 AND EXISTS (SELECT 1 FROM sources s WHERE s.id = d.source_id)`,
        [deletionId],
      );
    },
    async deleteSource(_deletionId, sourceId) {
      await withTransaction(pool, async (db) => {
        await db.query("DELETE FROM sources WHERE id = $1", [sourceId]);
        // A lista e a ação pendente que citam a fonte perdem o sentido (e levam o nome dela).
        await db.query(
          `UPDATE agent_conversation_state
              SET listing = CASE WHEN listing::text LIKE '%' || $1 || '%' THEN NULL ELSE listing END,
                  listing_at = CASE WHEN listing::text LIKE '%' || $1 || '%' THEN NULL ELSE listing_at END,
                  pending = CASE WHEN pending::text LIKE '%' || $1 || '%' THEN NULL ELSE pending END,
                  pending_expires_at = CASE WHEN pending::text LIKE '%' || $1 || '%' THEN NULL ELSE pending_expires_at END,
                  updated_at = now()
            WHERE listing::text LIKE '%' || $1 || '%' OR pending::text LIKE '%' || $1 || '%'`,
          [sourceId],
        );
      });
    },
    complete: (deletionId, objects) => withTransaction(pool, (db) => completeIn(db, queue, notifyQueue, deletionId, objects)),
  };
}
