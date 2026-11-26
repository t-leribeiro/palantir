// Itens guardados no PostgreSQL (feature 009, data-delta.md §4 e §5).
import { withTransaction, type Pool, type Queryable } from "../../../platform/db/index.js";
import type { ForgetResult, SavedContent, SavedEntry, SavedItemStore, SavedMessage, SavedOrigin, ThemeCount, ThemeListing } from "../application/saved-items.js";
import type { Theme } from "../domain/theme.js";

const SAVED_OF_MESSAGE = `
  SELECT k.id AS item_id, t.name AS theme, COALESCE(m.text, c.text) AS text
    FROM evidence_references e
    JOIN knowledge_items k ON k.id = e.knowledge_item_id AND k.kind = 'saved'
    JOIN themes t ON t.id = k.theme_id
    JOIN messages m ON m.id = e.message_id
    JOIN sources s ON s.id = m.source_id AND s.kind = 'saved'
    LEFT JOIN message_chunks c ON c.message_id = m.id AND c.idx = 0
   WHERE k.space_id = $1 AND e.message_id = $2
   LIMIT 1`;

interface EntryRow {
  item_id: string;
  message_id: string;
  kind: string;
  text: string | null;
  saved_at: Date;
  duration_s: string | null;
}

function toEntry(row: EntryRow): SavedEntry {
  return {
    itemId: row.item_id,
    messageId: row.message_id,
    kind: row.kind,
    text: row.text,
    savedAt: row.saved_at,
    ...(row.duration_s === null ? {} : { durationSeconds: Number(row.duration_s) }),
  };
}

async function savedMessage(db: Queryable, spaceId: string, messageId: string): Promise<SavedMessage | null> {
  const { rows } = await db.query<{ item_id: string; theme: string; text: string | null }>(SAVED_OF_MESSAGE, [spaceId, messageId]);
  const row = rows[0];
  return row ? { itemId: row.item_id, theme: row.theme, text: row.text } : null;
}

/** O id externo guardado é `<original>#<tema>`: a primeira cópia guardada desse original, só da fonte Guardados. */
const SAVED_ORIGIN = `
  SELECT m.kind, m.text, m.sent_at, a.mime_type, a.size_bytes::float8 AS size_bytes, a.sha256, a.storage_key, a.duration_s::float8 AS duration_s
    FROM messages m
    JOIN sources s ON s.id = m.source_id AND s.kind = 'saved'
    LEFT JOIN attachments a ON a.message_id = m.id AND a.storage_status = 'stored'
   WHERE m.space_id = $1 AND left(m.external_message_id, length($2) + 1) = $2 || '#'
   ORDER BY m.created_at, m.id
   LIMIT 1`;

interface OriginRow {
  kind: SavedOrigin["kind"];
  text: string | null;
  sent_at: Date;
  mime_type: string | null;
  size_bytes: number | null;
  sha256: string | null;
  storage_key: string | null;
  duration_s: number | null;
}

async function savedOrigin(db: Queryable, spaceId: string, originExternalId: string): Promise<SavedOrigin | null> {
  const row = (await db.query<OriginRow>(SAVED_ORIGIN, [spaceId, originExternalId])).rows[0];
  if (!row) return null;
  const attachment =
    row.storage_key && row.sha256 && row.mime_type
      ? { mimeType: row.mime_type, sizeBytes: row.size_bytes, sha256: row.sha256, storageKey: row.storage_key, durationSeconds: row.duration_s }
      : null;
  return { kind: row.kind, text: row.text, sentAt: row.sent_at, attachment };
}

async function attach(db: Queryable, spaceId: string, theme: Theme, messageId: string): Promise<{ itemId: string; theme: string }> {
  const existing = await savedMessage(db, spaceId, messageId);
  if (existing) return { itemId: existing.itemId, theme: existing.theme };
  // DO UPDATE sem mudança real: devolve a linha existente com o nome da primeira vez (RN-03).
  const { rows: themes } = await db.query<{ id: string; name: string }>(
    `INSERT INTO themes (space_id, name, normalized) VALUES ($1, $2, $3)
     ON CONFLICT (space_id, normalized) DO UPDATE SET normalized = EXCLUDED.normalized
     RETURNING id, name`,
    [spaceId, theme.name, theme.normalized],
  );
  const row = themes[0];
  if (!row) throw new Error("O banco não devolveu o tema.");
  const { rows: items } = await db.query<{ id: string }>(
    `INSERT INTO knowledge_items (space_id, kind, theme_id, created_by)
     SELECT $1, 'saved', $2, 'user' FROM messages WHERE id = $3 AND space_id = $1
     RETURNING id`,
    [spaceId, row.id, messageId],
  );
  const item = items[0];
  if (!item) throw new Error("A mensagem guardada não é deste espaço.");
  await db.query("INSERT INTO evidence_references (knowledge_item_id, message_id) VALUES ($1, $2)", [item.id, messageId]);
  return { itemId: item.id, theme: row.name };
}

/** Publica a purga das chaves sem referência na mesma transação (outbox, D-13). */
export type OrphanKeysHook = (db: Queryable, keys: readonly string[]) => Promise<void>;

async function forget(db: Queryable, spaceId: string, messageId: string, onOrphanKeys?: OrphanKeysHook): Promise<ForgetResult | null> {
  const saved = await savedMessage(db, spaceId, messageId);
  if (!saved) return null;
  const { rows: keys } = await db.query<{ storage_key: string }>(
    "SELECT storage_key FROM attachments WHERE message_id = $1 AND storage_key IS NOT NULL",
    [messageId],
  );
  await db.query(
    `DELETE FROM messages
      WHERE id = $1 AND space_id = $2
        AND source_id IN (SELECT id FROM sources WHERE space_id = $2 AND kind = 'saved')`,
    [messageId, spaceId],
  );
  const orphanStorageKeys: string[] = [];
  for (const { storage_key: key } of keys) {
    const { rows } = await db.query("SELECT 1 FROM attachments WHERE storage_key = $1 LIMIT 1", [key]);
    if (rows.length === 0) orphanStorageKeys.push(key);
  }
  if (orphanStorageKeys.length > 0) await onOrphanKeys?.(db, orphanStorageKeys);
  return { itemId: saved.itemId, theme: saved.theme, orphanStorageKeys };
}

export function createPgSavedItems(pool: Pool, options: { readonly onOrphanKeys?: OrphanKeysHook } = {}): SavedItemStore {
  return {
    async themeContents(spaceId, normalized): Promise<readonly SavedContent[]> {
      const { rows } = await pool.query<{ text: string | null; sha256: string | null }>(
        `SELECT m.text, a.sha256
           FROM knowledge_items k
           JOIN themes t ON t.id = k.theme_id
           JOIN evidence_references e ON e.knowledge_item_id = k.id
           JOIN messages m ON m.id = e.message_id
           LEFT JOIN attachments a ON a.message_id = m.id
          WHERE k.space_id = $1 AND k.kind = 'saved' AND t.normalized = $2`,
        [spaceId, normalized],
      );
      return rows.map((r) => ({ ...(r.text === null ? {} : { text: r.text }), ...(r.sha256 === null ? {} : { sha256: r.sha256 }) }));
    },
    attach: (spaceId, theme, messageId) => withTransaction(pool, (db) => attach(db, spaceId, theme, messageId)),
    async listTheme(spaceId, normalized, limit): Promise<ThemeListing> {
      const { rows: themes } = await pool.query<{ id: string; name: string; total: number }>(
        `SELECT t.id, t.name, (SELECT count(*)::int FROM knowledge_items k WHERE k.theme_id = t.id) AS total
           FROM themes t WHERE t.space_id = $1 AND t.normalized = $2`,
        [spaceId, normalized],
      );
      const theme = themes[0];
      if (!theme) return { theme: null, total: 0, items: [] };
      const { rows } = await pool.query<EntryRow>(
        `SELECT k.id AS item_id, m.id AS message_id, m.kind, COALESCE(m.text, c.text) AS text, k.created_at AS saved_at, a.duration_s
           FROM knowledge_items k
           JOIN evidence_references e ON e.knowledge_item_id = k.id
           JOIN messages m ON m.id = e.message_id
           LEFT JOIN attachments a ON a.message_id = m.id
           LEFT JOIN message_chunks c ON c.message_id = m.id AND c.idx = 0
          WHERE k.theme_id = $1
          ORDER BY k.created_at DESC, k.id DESC
          LIMIT $2`,
        [theme.id, limit],
      );
      return { theme: theme.name, total: theme.total, items: rows.map(toEntry) };
    },
    async listThemes(spaceId, limit): Promise<readonly ThemeCount[]> {
      const { rows } = await pool.query<{ name: string; count: number }>(
        `SELECT t.name, count(k.id)::int AS count
           FROM themes t JOIN knowledge_items k ON k.theme_id = t.id
          WHERE t.space_id = $1
          GROUP BY t.id, t.name
          ORDER BY max(k.created_at) DESC, t.name
          LIMIT $2`,
        [spaceId, limit],
      );
      return rows.map((r) => ({ theme: r.name, count: r.count }));
    },
    async themeName(spaceId, normalized) {
      const { rows } = await pool.query<{ name: string }>("SELECT name FROM themes WHERE space_id = $1 AND normalized = $2", [spaceId, normalized]);
      return rows[0]?.name ?? null;
    },
    savedMessage: (spaceId, messageId) => savedMessage(pool, spaceId, messageId),
    savedOrigin: (spaceId, originExternalId) => savedOrigin(pool, spaceId, originExternalId),
    forget: (spaceId, messageId) => withTransaction(pool, (db) => forget(db, spaceId, messageId, options.onOrphanKeys)),
  };
}
