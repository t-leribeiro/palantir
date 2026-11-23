// Ajuda curta para cumprimentos e pedidos de ajuda (feature 003: RF-14, D-10). Vale para qualquer canal.
import type { AgentReply } from "../../../contracts/channel/knowledge-channel.js";

export const HELP_TEXT = [
  "Oi! Eu sou o Palantír: respondo com base nas conversas que você me deu, sempre dizendo quem disse, onde e quando.",
  "",
  "Experimente perguntar:",
  "• Quem recomendou o Temporal?",
  "• O que falaram sobre Kafka?",
  "",
  "Por enquanto eu só entendo mensagens de texto.",
].join("\n");

const HELP_WORDS = new Set(["oi", "ola", "bom dia", "boa tarde", "boa noite", "ajuda", "help", "menu", "?"]);

/** Minúsculas, sem acento e sem pontuação; "?" sozinho continua valendo como pedido de ajuda. */
function normalize(text: string): string {
  const flat = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (/^\?+$/.test(flat)) return "?";
  return flat.replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

export function isHelpRequest(text: string): boolean {
  return HELP_WORDS.has(normalize(text));
}

export const helpReply = (): AgentReply => ({ text: HELP_TEXT, outcome: "help", citations: [] });

export const TEXT_ONLY_TEXT = "Por enquanto eu só entendo mensagens de texto.";

/** Áudio, imagem ou documento enviados ao agente (RF-06 da S2): áudios entram na S4. */
export const textOnlyReply = (): AgentReply => ({ text: TEXT_ONLY_TEXT, outcome: "help", citations: [] });

export function isTextual(kind: string): boolean {
  return kind === "text" || kind === "link";
}
