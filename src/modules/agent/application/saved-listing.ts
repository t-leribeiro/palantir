// Listar e esquecer guardados (feature 009, D-12, D-13; interfaces/comandos-guardar.md §4 e §5). A listagem grava as
// citações da S7, para o "mostra a N" e o "esquece a N"; esquecer pede "confirmo", como os atos destrutivos da S5.
import type { AgentReply } from "../../../contracts/channel/knowledge-channel.js";
import type { SavedItems } from "../../knowledge/index.js";
import { normalizeText } from "../domain/command.js";
import { info } from "../domain/management-replies.js";
import { noRecentReply, outOfRangeReply } from "../domain/original.js";
import { parseForget, parseSavedListing } from "../domain/save-command.js";
import { SAVE_TEXT, composeEmptyTheme, composeThemeListing, composeThemes, forgetPreview } from "../domain/saved-replies.js";
import type { CitationStore, ConversationStateStore } from "./conversation-state.js";
import { PENDING_TTL_MS } from "./manage-sources.js";
import { CITATIONS_TTL_MS } from "./show-source.js";

export interface SavedListingContext {
  readonly userId: string;
  readonly spaceId: string;
  readonly provider: string;
  readonly accountId: string;
}

export type ListingOutcome = "listed" | "empty" | "themes";

export interface SavedListingObserver {
  listing(outcome: ListingOutcome): void;
}

export interface SavedListingDeps {
  readonly library: Pick<SavedItems, "listTheme" | "listThemes" | "savedMessage">;
  /** Apaga o item guardado (com a auditoria e a purga do arquivo, compostas em `src/main`); `null` se já não existe. */
  readonly forget: (ctx: SavedListingContext, messageId: string) => Promise<{ readonly theme: string } | null>;
  readonly citations: CitationStore;
  readonly state: ConversationStateStore;
  readonly observer?: SavedListingObserver;
  readonly now?: () => Date;
}

export function createSavedListing(deps: SavedListingDeps) {
  const now = deps.now ?? (() => new Date());
  const report = (outcome: ListingOutcome, reply: AgentReply): AgentReply => {
    deps.observer?.listing(outcome);
    return reply;
  };

  async function listTheme(ctx: SavedListingContext, theme: string): Promise<AgentReply> {
    const listing = await deps.library.listTheme(ctx.spaceId, theme);
    if (!listing.theme || listing.items.length === 0) return report("empty", composeEmptyTheme(theme, await deps.library.listThemes(ctx.spaceId)));
    const reply = composeThemeListing(listing.theme, listing.total, listing.items);
    const items = reply.citations.map((c) => ({ index: c.index, messageId: c.messageId, kind: c.kind ?? "text" }));
    await deps.citations.saveCitations(ctx.userId, ctx.provider, { items, at: now() });
    return report("listed", reply);
  }

  async function askForget(ctx: SavedListingContext, index: number): Promise<AgentReply> {
    const stored = await deps.citations.citations(ctx.userId, ctx.provider);
    if (!stored || now().getTime() - stored.at.getTime() >= CITATIONS_TTL_MS) return noRecentReply();
    const citation = stored.items.find((c) => c.index === index);
    if (!citation) return outOfRangeReply(stored.items.length);
    const saved = await deps.library.savedMessage(ctx.spaceId, citation.messageId);
    if (!saved) return info(SAVE_TEXT.notSaved);
    const pending = { action: "forget" as const, ref: citation.messageId, title: saved.theme };
    await deps.state.savePending(ctx.userId, ctx.provider, { pending, expiresAt: new Date(now().getTime() + PENDING_TTL_MS) });
    return info(SAVE_TEXT.forgetAsk(forgetPreview(saved.text), saved.theme));
  }

  /** "confirmo" de um esquecer no prazo; `null` quando não há esquecer pendente (a S5 já tratou o resto). */
  async function confirmForget(ctx: SavedListingContext): Promise<AgentReply | null> {
    const stored = await deps.state.pending(ctx.userId, ctx.provider);
    if (stored?.pending.action !== "forget") return null;
    if (!(await deps.state.takePending(ctx.userId, ctx.provider, stored.pending.ref, now()))) return info(SAVE_TEXT.forgetExpired);
    const result = await deps.forget(ctx, stored.pending.ref);
    return info(result ? SAVE_TEXT.forgotten(result.theme) : SAVE_TEXT.notSaved);
  }

  /** A resposta à listagem, ao esquecer ou à confirmação; `null` quando a mensagem é outra coisa. */
  return async (ctx: SavedListingContext, text: string): Promise<AgentReply | null> => {
    const listing = parseSavedListing(text);
    if (listing?.kind === "themes") return report("themes", composeThemes(await deps.library.listThemes(ctx.spaceId)));
    if (listing) return listTheme(ctx, listing.theme);
    const index = parseForget(text);
    if (index !== null) return askForget(ctx, index);
    return normalizeText(text) === "confirmo" ? confirmForget(ctx) : null;
  };
}

export type SavedListing = ReturnType<typeof createSavedListing>;
