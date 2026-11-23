// Diretório de grupos do número de captura (feature 004, D-07): o processo do WhatsApp grava, o comando lê.
// Só nome e quantidade de participantes; nenhuma pessoa nem mensagem.
import type { Queryable } from "../../../platform/db/index.js";
import type { DirectoryGroup, GroupDirectory } from "../application/capture-authorization.js";

export function createPgGroupDirectory(db: Queryable): GroupDirectory {
  return {
    async upsert(groups, seenAt) {
      if (groups.length === 0) return;
      await db.query(
        `INSERT INTO whatsapp_groups (group_id, subject, participants, seen_at, left_at)
         SELECT g.group_id, g.subject, g.participants, $4, NULL
           FROM unnest($1::text[], $2::text[], $3::int[]) AS g(group_id, subject, participants)
         ON CONFLICT (group_id) DO UPDATE
           SET subject = EXCLUDED.subject, participants = EXCLUDED.participants, seen_at = EXCLUDED.seen_at, left_at = NULL`,
        [groups.map((g) => g.groupId), groups.map((g) => g.subject), groups.map((g) => g.participants), seenAt],
      );
    },

    async markMissingAsLeft(present, at) {
      await db.query("UPDATE whatsapp_groups SET left_at = $2 WHERE left_at IS NULL AND NOT (group_id = ANY($1::text[]))", [present, at]);
    },

    async list(): Promise<readonly DirectoryGroup[]> {
      const { rows } = await db.query<{ group_id: string; subject: string; participants: number; seen_at: Date; left_at: Date | null }>(
        "SELECT group_id, subject, participants, seen_at, left_at FROM whatsapp_groups",
      );
      return rows.map((r) => ({
        groupId: r.group_id,
        subject: r.subject,
        participants: r.participants,
        seenAt: new Date(r.seen_at),
        leftAt: r.left_at ? new Date(r.left_at) : null,
      }));
    },
  };
}
