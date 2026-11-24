// Leitura e mescla do .env gerado pelo setup (feature 003, RF-02; feature 005, D-05): as variáveis do WhatsApp
// e da mídia do .env anterior são preservadas, e as chaves só são geradas quando faltam. Trocar a chave da
// sessão obriga a parear de novo; trocar a de mídia torna ilegíveis os áudios já guardados.
import { randomBytes } from "node:crypto";

export const PRESERVED = [
  "PALANTIR_WHATSAPP_ENABLED",
  "PALANTIR_WHATSAPP_CAPTURE",
  "PALANTIR_WA_SESSION_KEY",
  "PALANTIR_WA_SESSION_DIR",
  "PALANTIR_WHATSAPP_HEALTH_PORT",
  // Mídia e transcrição (feature 005): trocar a chave de mídia torna os áudios guardados ilegíveis.
  "PALANTIR_MEDIA_KEY",
  "PALANTIR_MEDIA_STORE_KINDS",
  "PALANTIR_TRANSCRIPTION",
  "PALANTIR_TRANSCRIBER",
  "PALANTIR_TRANSCRIBER_URL",
  "PALANTIR_TRANSCRIBER_MODEL",
  "PALANTIR_TRANSCRIBER_ALLOW_REMOTE",
  "PALANTIR_TRANSCRIBER_API_KEY",
  "PALANTIR_TRANSCRIBE_CONCURRENCY",
];

/** Chaves geradas quando faltam: a da sessão do WhatsApp (S2) e a dos arquivos de mídia (S4). */
const GENERATED_KEYS = ["PALANTIR_WA_SESSION_KEY", "PALANTIR_MEDIA_KEY"];

export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

export const newSessionKey = () => randomBytes(32).toString("base64");

export function mergeEnv(generated, previous, makeKey = newSessionKey) {
  const old = parseEnv(previous);
  let content = generated;
  for (const name of PRESERVED) {
    if (old[name]) content = setVar(content, name, old[name]);
  }
  for (const name of GENERATED_KEYS) {
    if (!parseEnv(content)[name]) content = setVar(content, name, makeKey());
  }
  return content;
}

function setVar(content, name, value) {
  const line = new RegExp(`^${name}=.*$`, "m");
  if (line.test(content)) return content.replace(line, () => `${name}=${value}`);
  return `${content.endsWith("\n") ? content : `${content}\n`}${name}=${value}\n`;
}
