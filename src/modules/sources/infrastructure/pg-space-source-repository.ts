import type { Queryable } from "../../../platform/db/index.js";
import type { SpaceSource, SpaceSourceRepository } from "../application/source-management.js";

export function createPgSpaceSourceRepository(db: Queryable): SpaceSourceRepository {
  return {
    async listForSpace(spaceId): Promise<readonly SpaceSource[]> {
      const { rows } = await db.query<{ id: string; title: string; external_conversation_id: string; kind: string }>(
        "SELECT id, title, external_conversation_id, kind FROM sources WHERE space_id = $1 AND status <> 'deleting' ORDER BY title, id",
        [spaceId],
      );
      return rows.map((r) => ({ id: r.id, title: r.title, conversationId: r.external_conversation_id, kind: r.kind }));
    },
  };
}
