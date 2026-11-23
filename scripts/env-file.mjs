// Leitura e mescla do .env gerado pelo setup (feature 003, RF-02): as variáveis do WhatsApp do .env
// anterior são preservadas, e a chave da sessão só é gerada quando falta. Trocar a chave obriga a parear de novo.
import { randomBytes } from "node:crypto";

export const PRESERVED = ["PALANTIR_WHATSAPP_ENABLED", "PALANTIR_WA_SESSION_KEY", "PALANTIR_WA_SESSION_DIR", "PALANTIR_WHATSAPP_HEALTH_PORT"];

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
  if (!parseEnv(content).PALANTIR_WA_SESSION_KEY) content = setVar(content, "PALANTIR_WA_SESSION_KEY", makeKey());
  return content;
}

function setVar(content, name, value) {
  const line = new RegExp(`^${name}=.*$`, "m");
  if (line.test(content)) return content.replace(line, () => `${name}=${value}`);
  return `${content.endsWith("\n") ? content : `${content}\n`}${name}=${value}\n`;
}
