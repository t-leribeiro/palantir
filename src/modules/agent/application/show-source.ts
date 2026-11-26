// "mostra a N" (feature 008, interfaces/comando-mostrar.md §2): a citação N da última resposta com citações, lida
// de novo pelo id dentro do espaço do dono, com a conversa em volta. Sem LLM e sem busca: só leitura.
import type { AgentReply } from "../../../contracts/channel/knowledge-channel.js";
import { CONTEXT_NEIGHBORS, type SourceContext } from "../../retrieval/index.js";
import { composeOriginal, deletedReply, noRecentReply, notFoundReply, outOfRangeReply } from "../domain/original.js";
import type { CitationStore, StoredCitation } from "./conversation-state.js";

/** As citações valem 2 h a partir da resposta (esclarecimento de 2026-11-25, RN-01). */
export const CITATIONS_TTL_MS = 2 * 60 * 60 * 1000;

export type ShowSourceOutcome = "shown" | "no_recent" | "out_of_range" | "deleted" | "not_found";

/** Métrica sem conteúdo: só o resultado e o tipo da mensagem mostrada (D-12). */
export interface ShowSourceObserver {
  shown(outcome: ShowSourceOutcome, kind?: string): void;
}

export interface ShowSourceDeps {
  readonly citations: CitationStore;
  readonly context: SourceContext;
  readonly observer?: ShowSourceObserver;
  readonly now?: () => Date;
}

export interface ShowSourceContext {
  readonly userId: string;
  readonly spaceId: string;
  readonly provider: string;
}

export type ShowSource = (ctx: ShowSourceContext, index: number) => Promise<AgentReply>;

const shownCitation = (c: StoredCitation) =>
  c.audioStartS !== undefined && c.audioEndS !== undefined ? { index: c.index, audioStartS: c.audioStartS, audioEndS: c.audioEndS } : { index: c.index };

export function createShowSource(deps: ShowSourceDeps): ShowSource {
  const now = deps.now ?? (() => new Date());
  const report = (outcome: ShowSourceOutcome, reply: AgentReply, kind?: string): AgentReply => {
    deps.observer?.shown(outcome, kind);
    return reply;
  };

  return async (ctx, index) => {
    const stored = await deps.citations.citations(ctx.userId, ctx.provider);
    if (!stored || now().getTime() - stored.at.getTime() >= CITATIONS_TTL_MS) return report("no_recent", noRecentReply());
    const citation = stored.items.find((c) => c.index === index);
    if (!citation) return report("out_of_range", outOfRangeReply(stored.items.length));
    const result = await deps.context.around(ctx.spaceId, citation.messageId, CONTEXT_NEIGHBORS);
    if (result.status === "deleted") return report("deleted", deletedReply());
    if (result.status === "not_found") return report("not_found", notFoundReply());
    return report("shown", composeOriginal(shownCitation(citation), result), result.message.kind);
  };
}
