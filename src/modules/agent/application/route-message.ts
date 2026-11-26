// O que a feature 009 acrescenta ao roteamento do agente (D-04; interfaces/comandos-guardar.md §1). Fica fora de
// `ask-question.ts` para manter a complexidade baixa: o encaminhado e a mídia esperam o pedido; no texto, a resposta
// de tema e o guardar vêm antes dos comandos da S5, e a listagem e o esquecer, depois deles.
import type { AgentReply, CanonicalMessage } from "../../../contracts/channel/knowledge-channel.js";
import { THEME_MAX_CHARS } from "../../knowledge/index.js";
import { parseCommand } from "../domain/command.js";
import { isHelpRequest } from "../domain/help.js";
import { parseForget, parseSave, parseSavedListing } from "../domain/save-command.js";
import { parseShowSource } from "../domain/show-source.js";
import type { SaveContentService, SaveContext } from "./save-content.js";
import type { SavedListing } from "./saved-listing.js";

export interface SavedRouting {
  readonly save: SaveContentService;
  readonly listing: SavedListing;
}

/** Uma mensagem que é comando de algum tipo nunca vira resposta de tema (D-14). */
function isCommand(text: string): boolean {
  return (
    parseSave(text) !== null ||
    parseCommand(text) !== null ||
    parseSavedListing(text) !== null ||
    parseForget(text) !== null ||
    parseShowSource(text) !== null ||
    isHelpRequest(text)
  );
}

/** Encaminhado ou mídia mandada direto: espera o pedido (RN-02, RN-11). `undefined` quando é texto comum. */
export function holdIfContent(routing: SavedRouting, ctx: SaveContext, message: CanonicalMessage, textual: boolean): AgentReply | null | undefined {
  if (!message.isForwarded && textual) return undefined;
  return routing.save.hold(ctx, message);
}

/** Resposta de tema e pedido de guardar, antes dos comandos da S5. `null` quando não é com o guardar. */
export async function beforeCommands(routing: SavedRouting, ctx: SaveContext, message: CanonicalMessage, text: string): Promise<AgentReply | null> {
  const command = parseSave(text);
  if (command) return routing.save.run(ctx, command, message);
  if (routing.save.awaitingTheme(ctx) && text.length <= THEME_MAX_CHARS && !isCommand(text)) return routing.save.answerTheme(ctx, text, message);
  return null;
}

/** Texto comum, antes da busca: pode entrar numa leva de textos encaminhados (`undefined` segue como pergunta). */
export function screenText(routing: SavedRouting, ctx: SaveContext, message: CanonicalMessage): Promise<AgentReply | null | undefined> {
  return routing.save.screen(ctx, message);
}

/** Listagem, "esquece a N" e a confirmação dele, depois dos comandos da S5. */
export function afterCommands(routing: SavedRouting, ctx: SaveContext, text: string): Promise<AgentReply | null> {
  return routing.listing(ctx, text);
}

/** O aviso de "sem tema" vai uma vez, antes da próxima resposta (D-14). */
export function withUntitledNotice(routing: SavedRouting, ctx: SaveContext, reply: AgentReply | null): AgentReply | null {
  const notice = routing.save.untitledNotice(ctx);
  if (!notice) return reply;
  return reply ? { ...reply, text: `${notice}\n\n${reply.text}` } : { text: notice, outcome: "help", citations: [] };
}
