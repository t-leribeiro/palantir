// Política de mídia (feature 005, RN-06, RN-10, D-02, D-11): que tipo é cada anexo, quais são guardados,
// quais têm processador e os limites. Comum a todos os tipos: ligar imagem ou documento é configuração.

export const MEDIA_KINDS = ["audio", "image", "document", "video", "other"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Anexo acima disto não é guardado (`too_large`); a cifra é feita em memória (D-05). */
export const MAX_ATTACHMENT_BYTES = 64 * 1024 * 1024;
/** Áudio acima disto não é transcrito (`too_long`, RF-08 da spec). */
export const MAX_AUDIO_SECONDS = 60 * 60;

const AUDIO_EXTENSIONS = new Set(["opus", "ogg", "oga", "m4a", "mp3", "aac", "amr", "wav"]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "3gp", "mkv", "webm"]);
const DOCUMENT_EXTENSIONS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "vcf"]);

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  opus: "audio/ogg; codecs=opus",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  aac: "audio/aac",
  amr: "audio/amr",
  wav: "audio/wav",
};

/** Tipo pelo MIME (`audio/ogg; codecs=opus` → audio). */
export function mediaKindOfMime(mimeType: string): MediaKind {
  const type = mimeType.split("/")[0]?.trim().toLowerCase();
  if (type === "audio" || type === "image" || type === "video") return type;
  if (type === "application" || type === "text") return "document";
  return "other";
}

const extensionOf = (fileName: string): string => fileName.split(".").pop()?.toLowerCase() ?? "";

/** Tipo pelo nome do arquivo de referência do export (`PTT-20251101-WA0003.opus` → audio). */
export function mediaKindOfFileName(fileName: string): MediaKind {
  const ext = extensionOf(fileName);
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (DOCUMENT_EXTENSIONS.has(ext)) return "document";
  return "other";
}

/** MIME para um arquivo de áudio pelo nome; outros tipos ficam genéricos. */
export const mimeOfFileName = (fileName: string): string => MIME_BY_EXTENSION[extensionOf(fileName)] ?? "application/octet-stream";

export interface MediaPolicy {
  /** O anexo deste tipo é baixado e guardado? */
  stores(kind: MediaKind): boolean;
}

export function createMediaPolicy(storeKinds: readonly string[]): MediaPolicy {
  const kinds = new Set(storeKinds);
  return { stores: (kind) => kinds.has(kind) };
}

/** `true` quando o MIME indica Ogg (onde a duração sai do arquivo, D-11). */
export const isOggMime = (mimeType: string): boolean => /^audio\/ogg\b/i.test(mimeType.trim());
