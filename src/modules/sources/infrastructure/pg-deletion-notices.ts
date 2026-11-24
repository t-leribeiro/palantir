import type { Queryable } from "../../../platform/db/index.js";

/** Aviso de exclusão reivindicado por um canal: para quem mandar e o que dizer. */
export interface ClaimedNotice {
  readonly accountId: string;
  readonly title: string | null;
  readonly messages: number;
  readonly audios: number;
}

/**
 * Reivindicação do aviso de exclusão concluída (feature 006, D-10): só um envio, mesmo com reentrega do job. Se o
 * envio falhar, a reivindicação volta e o pg-boss tenta de novo. Depois do envio, o nome da conversa é apagado.
 */
export interface DeletionNotices {
  claim(deletionId: string, provider: string): Promise<ClaimedNotice | null>;
  release(deletionId: string): Promise<void>;
  forgetTitle(deletionId: string): Promise<void>;
}

export function createPgDeletionNotices(db: Queryable): DeletionNotices {
  return {
    async claim(deletionId, provider) {
      const { rows } = await db.query<{ notify_account: string; notify_title: string | null; messages_deleted: number | null; audios_deleted: number | null }>(
        `UPDATE source_deletions SET notified_at = now()
          WHERE id = $1 AND notify_provider = $2 AND notified_at IS NULL AND completed_at IS NOT NULL
          RETURNING notify_account, notify_title, messages_deleted, audios_deleted`,
        [deletionId, provider],
      );
      const row = rows[0];
      return row ? { accountId: row.notify_account, title: row.notify_title, messages: row.messages_deleted ?? 0, audios: row.audios_deleted ?? 0 } : null;
    },
    async release(deletionId) {
      await db.query("UPDATE source_deletions SET notified_at = NULL WHERE id = $1", [deletionId]);
    },
    async forgetTitle(deletionId) {
      await db.query("UPDATE source_deletions SET notify_title = NULL WHERE id = $1", [deletionId]);
    },
  };
}
