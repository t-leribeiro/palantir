// Guardar, listar e esquecer (feature 009, D-06; interfaces/comandos-guardar.md §2, §4 e §5). Palavras fixas, sem
// LLM. O guardar é lido no texto cru, porque o ":" e a URL do conteúdo importam; o resto, na forma normalizada.
import { normalizeText } from "./command.js";

export type SaveCommand =
  /** "guarda em X" (com `content` quando veio depois de ":"). */
  | { readonly kind: "save"; readonly theme: string; readonly content?: string }
  /** "guarda isso" sem tema: o agente pergunta (RN-04). */
  | { readonly kind: "ask_theme" };

const SAVE = /^\s*guard(?:a|ar)(?:\s+isso)?(?:\s+em\s+([\s\S]*))?$/i;
const TRAILING_PUNCTUATION = /[\s.!?;,]+$/u;

/** O pedido de guardar, ou `null` quando a mensagem é outra coisa ("como guardar senhas?" é pergunta). */
export function parseSave(text: string): SaveCommand | null {
  const match = SAVE.exec(text);
  if (!match) return null;
  const rest = match[1];
  if (rest === undefined) return { kind: "ask_theme" };
  const colon = rest.indexOf(":");
  const rawTheme = colon === -1 ? rest : rest.slice(0, colon);
  const content = colon === -1 ? "" : rest.slice(colon + 1).trim();
  const theme = rawTheme.trim().replace(TRAILING_PUNCTUATION, "");
  if (theme === "") return { kind: "ask_theme" };
  return content === "" ? { kind: "save", theme } : { kind: "save", theme, content };
}

export type SavedListingCommand = { readonly kind: "themes" } | { readonly kind: "theme"; readonly theme: string };

const THEMES = /^(?:temas|meus temas|guardados|meus guardados)$/;
const THEME_LISTING = [
  /^\s*(?:meus\s+)?guardados\s+(?:de\s+|sobre\s+|em\s+)?(.+?)[\s?.!]*$/i,
  /^\s*o\s+que\s+(?:eu\s+)?guardei\s+(?:sobre|em|de)\s+(.+?)[\s?.!]*$/i,
];

/** "temas", "guardados <tema>" ou "o que guardei sobre <tema>?"; `null` quando não é listagem. */
export function parseSavedListing(text: string): SavedListingCommand | null {
  if (THEMES.test(normalizeText(text))) return { kind: "themes" };
  for (const pattern of THEME_LISTING) {
    const theme = pattern.exec(text)?.[1]?.trim();
    if (theme) return { kind: "theme", theme };
  }
  return null;
}

const FORGET = /^(?:esquece|esquecer)(?: a| o)? ([1-9])$/;

/** "esquece a N", com N de 1 a 9 (as citações da última resposta, como no "mostra a N"). */
export function parseForget(text: string): number | null {
  const match = FORGET.exec(normalizeText(text));
  return match ? Number(match[1]) : null;
}
