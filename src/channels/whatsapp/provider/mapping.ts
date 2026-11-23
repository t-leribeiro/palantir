// Funções puras do provedor real (feature 003): JID para E.164 (D-06), conversas ignoradas (D-16), tipo da
// mensagem (D-17) e espera de reconexão (D-14). Sem a biblioteca: testáveis e reaproveitáveis.
import { normalizePhone } from "../../../shared/index.js";
import type { DirectKind } from "./provider.js";

const PHONE_JID = /^(\d+)(?::\d+)?@s\.whatsapp\.net$/;
const IGNORED_SUFFIXES = ["@g.us", "@broadcast", "@newsletter"];

/** Número do remetente a partir de um JID de telefone; LID, grupo e vazio devolvem `null`. */
export function phoneFromJid(jid: string | null | undefined): string | null {
  const match = jid ? PHONE_JID.exec(jid) : null;
  return match?.[1] ? normalizePhone(match[1]) : null;
}

/** O número do agente só conversa 1:1: grupos, listas de transmissão, status e canais ficam de fora (RN-01). */
export function isIgnoredJid(jid: string): boolean {
  return IGNORED_SUFFIXES.some((suffix) => jid.endsWith(suffix));
}

type Content = Record<string, unknown> | null | undefined;

const NOISE = new Set(["messageContextInfo", "senderKeyDistributionMessage"]);
const IGNORED = new Set(["protocolMessage", "reactionMessage", "pollUpdateMessage", "keepInChatMessage", "encReactionMessage"]);
const KINDS: Record<string, DirectKind> = {
  conversation: "text",
  extendedTextMessage: "text",
  audioMessage: "audio",
  imageMessage: "image",
  documentMessage: "document",
  documentWithCaptionMessage: "document",
  videoMessage: "video",
  ptvMessage: "video",
  stickerMessage: "sticker",
};

/** Texto da mensagem (simples ou estendida), quando houver. */
export function textOf(content: Content): string | undefined {
  if (!content) return undefined;
  if (typeof content.conversation === "string") return content.conversation;
  const extended = content.extendedTextMessage as { text?: unknown } | undefined;
  return typeof extended?.text === "string" ? extended.text : undefined;
}

export function classifyContent(content: Content): DirectKind | "ignore" {
  const type = Object.keys(content ?? {}).find((key) => !NOISE.has(key) && content?.[key] != null);
  if (!type || IGNORED.has(type)) return "ignore";
  const kind = KINDS[type] ?? "other";
  if (kind === "text" && !textOf(content)?.trim()) return "ignore";
  return kind;
}

const BASE_MS = 1000;
const MAX_MS = 60_000;
const JITTER = 0.2;

/** 1 s, 2 s, 4 s, ... até 60 s, com variação de ±20% para não reconectar em sincronia. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const exponential = Math.min(MAX_MS, BASE_MS * 2 ** attempt);
  const jittered = exponential * (1 - JITTER + 2 * JITTER * random());
  return Math.round(Math.min(MAX_MS, jittered));
}
