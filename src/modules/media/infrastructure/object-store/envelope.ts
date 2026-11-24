// Envelope de cifra dos objetos de mídia (feature 005, D-05): AES-256-GCM com a chave do .env.
// Formato: versão (1 byte) | IV (12) | texto cifrado | tag (16). O mesmo padrão da sessão do WhatsApp (S2).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const ENVELOPE_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export class EnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvelopeError";
  }
}

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) throw new EnvelopeError(`a chave de mídia deve ter ${KEY_BYTES} bytes`);
}

export function seal(plain: Uint8Array, key: Buffer, iv: Buffer = randomBytes(IV_BYTES)): Buffer {
  assertKey(key);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from([ENVELOPE_VERSION]), iv, body, cipher.getAuthTag()]);
}

export function open(sealed: Uint8Array, key: Buffer): Buffer {
  assertKey(key);
  const data = Buffer.from(sealed.buffer, sealed.byteOffset, sealed.byteLength);
  if (data.length < 1 + IV_BYTES + TAG_BYTES || data[0] !== ENVELOPE_VERSION) throw new EnvelopeError("objeto de mídia sem o envelope esperado");
  const iv = data.subarray(1, 1 + IV_BYTES);
  const tag = data.subarray(data.length - TAG_BYTES);
  const body = data.subarray(1 + IV_BYTES, data.length - TAG_BYTES);
  // Tag de tamanho fixo: sem isso, uma tag mais curta poderia ser aceita (Semgrep gcm-no-tag-length).
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new EnvelopeError("objeto de mídia adulterado ou chave errada");
  }
}

/** `true` quando os bytes têm o cabeçalho do envelope (usado pelo `media:conferir`). */
export const isSealed = (data: Uint8Array): boolean => data.length >= 1 + IV_BYTES + TAG_BYTES && data[0] === ENVELOPE_VERSION;
