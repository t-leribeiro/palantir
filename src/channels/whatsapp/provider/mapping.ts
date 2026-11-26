// Funções puras do provedor real (feature 003): JID para E.164 (D-06), conversas ignoradas (D-16), tipo da
// mensagem (D-17) e espera de reconexão (D-14). Sem a biblioteca: testáveis e reaproveitáveis.
import { normalizePhone } from "../../../shared/index.js";
import type { DirectKind } from "./provider.js";

const PHONE_JID = /^(\d+)(?::\d+)?@s\.whatsapp\.net$/;
const LID_JID = /^(\d+)(?::\d+)?@lid$/;
const GROUP_SUFFIX = "@g.us";
const ALWAYS_IGNORED = ["@broadcast", "@newsletter"];

/** Número do remetente a partir de um JID de telefone; LID, grupo e vazio devolvem `null`. */
export function phoneFromJid(jid: string | null | undefined): string | null {
  const match = jid ? PHONE_JID.exec(jid) : null;
  return match?.[1] ? normalizePhone(match[1]) : null;
}

export function isGroupJid(jid: string | null | undefined): boolean {
  return Boolean(jid?.endsWith(GROUP_SUFFIX));
}

/**
 * Listas de transmissão, status e canais ficam sempre de fora. Grupos só entram com a captura ligada
 * (feature 004, D-03); sem ela, o número do agente só conversa 1:1 (RN-01 da S2).
 */
export function isIgnoredJid(jid: string, acceptGroups = false): boolean {
  if (isGroupJid(jid)) return !acceptGroups;
  return ALWAYS_IGNORED.some((suffix) => jid.endsWith(suffix));
}

/** "lid:<id>" a partir de um JID `@lid`; outros devolvem `null`. */
export function lidFromJid(jid: string | null | undefined): string | null {
  const match = jid ? LID_JID.exec(jid) : null;
  return match?.[1] ? `lid:${match[1]}` : null;
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

/** O objeto do tipo da mensagem; o documento com legenda vem embrulhado (`documentWithCaptionMessage.message`). */
function typedOf(content: Content): Record<string, unknown> | undefined {
  const type = Object.keys(content ?? {}).find((key) => !NOISE.has(key) && content?.[key] != null);
  const value = type ? content?.[type] : undefined;
  if (!value || typeof value !== "object") return undefined;
  if (type !== "documentWithCaptionMessage") return value as Record<string, unknown>;
  const inner = (value as { message?: { documentMessage?: unknown } }).message?.documentMessage;
  return inner && typeof inner === "object" ? (inner as Record<string, unknown>) : undefined;
}

/**
 * Encaminhada e citada (feature 009, D-02), pelo `contextInfo` do tipo da mensagem. Texto puro (`conversation`)
 * não tem `contextInfo`: chega como não encaminhado.
 */
export function contextOf(content: Content): { isForwarded: boolean; quotedId?: string } {
  const info = typedOf(content)?.contextInfo as { isForwarded?: unknown; stanzaId?: unknown } | undefined;
  const quotedId = typeof info?.stanzaId === "string" && info.stanzaId !== "" ? info.stanzaId : undefined;
  return { isForwarded: info?.isForwarded === true, ...(quotedId ? { quotedId } : {}) };
}

/** Legenda de foto, vídeo ou documento (feature 009, RN-11), quando houver. */
export function captionOf(content: Content): string | undefined {
  const caption = typedOf(content)?.caption;
  return typeof caption === "string" && caption.trim() !== "" ? caption : undefined;
}

/** Campos da mídia na mensagem (feature 005, D-18): MIME, duração e tamanho, sem baixar nada. */
export function mediaInfoOf(content: Content): { mimeType: string; seconds?: number; sizeBytes?: number } | undefined {
  const type = Object.keys(content ?? {}).find((key) => !NOISE.has(key) && content?.[key] != null);
  const kind = type ? KINDS[type] : undefined;
  if (!type || !kind || kind === "text") return undefined;
  return mediaFields(content?.[type] as MediaFields | undefined);
}

interface MediaFields {
  readonly mimetype?: unknown;
  readonly seconds?: unknown;
  readonly fileLength?: unknown;
}

function mediaFields(media: MediaFields | undefined): { mimeType: string; seconds?: number; sizeBytes?: number } {
  const seconds = toNumber(media?.seconds);
  const sizeBytes = toNumber(media?.fileLength);
  const mimeType = typeof media?.mimetype === "string" && media.mimetype !== "" ? media.mimetype : "application/octet-stream";
  return { mimeType, ...(seconds === undefined ? {} : { seconds }), ...(sizeBytes === undefined ? {} : { sizeBytes }) };
}

/** Número de um campo protobuf (pode vir como Long). */
function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
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

/**
 * Motivo técnico de um erro da biblioteca (ex.: "Bad MAC", "No SenderKeyRecord found for decryption"),
 * sem o resto do objeto, que pode trazer a mensagem ou a chave dela. Sequências longas de dígitos
 * (telefones, ids) viram "#" e o texto é cortado em 80 caracteres.
 */
export function libraryErrorReason(obj: unknown): string | undefined {
  const candidates = [obj, (obj as { err?: unknown } | null)?.err, (obj as { error?: unknown } | null)?.error];
  const error = candidates.find((c): c is Error => c instanceof Error);
  if (!error) return undefined;
  const reason = `${error.name}: ${error.message}`.replace(/\d{5,}/g, "#").replace(/\s+/g, " ").trim();
  return reason.slice(0, 80);
}
