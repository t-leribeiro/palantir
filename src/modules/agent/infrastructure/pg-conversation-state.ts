import type { Queryable } from "../../../platform/db/index.js";
import type { CitationStore, ConversationStateStore, PendingAction, StoredCitation, StoredCitations, StoredListing, StoredPending } from "../application/conversation-state.js";
import type { ListItem } from "../domain/conversation-ref.js";

interface Row {
  listing: ListItem[] | null;
  listing_page: number | null;
  listing_at: Date | null;
  pending: PendingAction | null;
  pending_expires_at: Date | null;
}

const UPSERT_LISTING = `
INSERT INTO agent_conversation_state (user_id, provider, listing, listing_page, listing_at, updated_at)
VALUES ($1, $2, $3, $4, $5, now())
ON CONFLICT (user_id, provider) DO UPDATE
  SET listing = EXCLUDED.listing, listing_page = EXCLUDED.listing_page, listing_at = EXCLUDED.listing_at, updated_at = now()`;

const UPSERT_PENDING = `
INSERT INTO agent_conversation_state (user_id, provider, pending, pending_expires_at, updated_at)
VALUES ($1, $2, $3, $4, now())
ON CONFLICT (user_id, provider) DO UPDATE
  SET pending = EXCLUDED.pending, pending_expires_at = EXCLUDED.pending_expires_at, updated_at = now()`;

const UPSERT_CITATIONS = `
INSERT INTO agent_conversation_state (user_id, provider, citations, citations_at, updated_at)
VALUES ($1, $2, $3, $4, now())
ON CONFLICT (user_id, provider) DO UPDATE
  SET citations = EXCLUDED.citations, citations_at = EXCLUDED.citations_at, updated_at = now()`;

const CLEAR_PENDING = `
UPDATE agent_conversation_state SET pending = NULL, pending_expires_at = NULL, updated_at = now()
 WHERE user_id = $1 AND provider = $2`;

export function createPgConversationState(db: Queryable): ConversationStateStore & CitationStore {
  async function row(userId: string, provider: string): Promise<Row | undefined> {
    const { rows } = await db.query<Row>(
      "SELECT listing, listing_page, listing_at, pending, pending_expires_at FROM agent_conversation_state WHERE user_id = $1 AND provider = $2",
      [userId, provider],
    );
    return rows[0];
  }

  return {
    async listing(userId, provider): Promise<StoredListing | null> {
      const r = await row(userId, provider);
      if (!r?.listing || !r.listing_at) return null;
      return { items: r.listing, page: r.listing_page ?? 1, at: new Date(r.listing_at) };
    },
    async saveListing(userId, provider, listing) {
      await db.query(UPSERT_LISTING, [userId, provider, JSON.stringify(listing.items), listing.page, listing.at]);
    },
    async pending(userId, provider): Promise<StoredPending | null> {
      const r = await row(userId, provider);
      if (!r?.pending || !r.pending_expires_at) return null;
      return { pending: r.pending, expiresAt: new Date(r.pending_expires_at) };
    },
    async savePending(userId, provider, { pending, expiresAt }) {
      await db.query(UPSERT_PENDING, [userId, provider, JSON.stringify(pending), expiresAt]);
    },
    async takePending(userId, provider, ref, now) {
      const { rowCount } = await db.query(`${CLEAR_PENDING} AND pending->>'ref' = $3 AND pending_expires_at > $4`, [userId, provider, ref, now]);
      return rowCount === 1;
    },
    async clearPending(userId, provider) {
      await db.query(CLEAR_PENDING, [userId, provider]);
    },
    async citations(userId, provider): Promise<StoredCitations | null> {
      const { rows } = await db.query<{ citations: StoredCitation[] | null; citations_at: Date | null }>(
        "SELECT citations, citations_at FROM agent_conversation_state WHERE user_id = $1 AND provider = $2",
        [userId, provider],
      );
      const r = rows[0];
      return r?.citations && r.citations_at ? { items: r.citations, at: new Date(r.citations_at) } : null;
    },
    async saveCitations(userId, provider, { items, at }) {
      await db.query(UPSERT_CITATIONS, [userId, provider, JSON.stringify(items), at]);
    },
  };
}
