import type { Queryable } from "../../../platform/db/index.js";

/** Exclusões em andamento e a idade da mais antiga, para o painel e o alerta `SourceDeletionStalled` (D-16). */
export async function deletionsInProgress(db: Queryable): Promise<{ count: number; oldestSeconds: number }> {
  const { rows } = await db.query<{ n: number; oldest: number | null }>(
    "SELECT count(*)::int AS n, extract(epoch FROM now() - min(requested_at))::float8 AS oldest FROM source_deletions WHERE completed_at IS NULL",
  );
  return { count: rows[0]?.n ?? 0, oldestSeconds: Math.max(0, rows[0]?.oldest ?? 0) };
}

/** Duração e contagens de uma exclusão concluída (só números). */
export async function completedDeletion(
  db: Queryable,
  deletionId: string,
): Promise<{ seconds: number; messages: number; audios: number; objects: number } | null> {
  const { rows } = await db.query<{ seconds: number; messages: number | null; audios: number | null; objects: number | null }>(
    `SELECT extract(epoch FROM completed_at - requested_at)::float8 AS seconds, messages_deleted AS messages, audios_deleted AS audios, objects_deleted AS objects
       FROM source_deletions WHERE id = $1 AND completed_at IS NOT NULL`,
    [deletionId],
  );
  const row = rows[0];
  return row ? { seconds: row.seconds, messages: row.messages ?? 0, audios: row.audios ?? 0, objects: row.objects ?? 0 } : null;
}
