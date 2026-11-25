// Prova de posse da conta de canal por código de uso único (feature 006, D-11; RN-02).
// No banco fica só o hash com sal; a comparação é em tempo constante.
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const CODE_TTL_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 5;
const SALT_BYTES = 16;

/** Código de 6 dígitos, com zeros à esquerda. */
export function generateCode(random: (max: number) => number = (max) => randomInt(max)): string {
  return String(random(1_000_000)).padStart(6, "0");
}

export const newSalt = (): Buffer => randomBytes(SALT_BYTES);

export function hashCode(salt: Uint8Array, code: string): Buffer {
  return createHash("sha256").update(salt).update(code, "utf8").digest();
}

export function codeMatches(salt: Uint8Array, expectedHash: Uint8Array, code: string): boolean {
  const actual = hashCode(salt, code);
  return actual.length === expectedHash.length && timingSafeEqual(actual, expectedHash);
}

/** "482913" → "482 913", como o terminal mostra. */
export const formatCode = (code: string): string => `${code.slice(0, 3)} ${code.slice(3)}`;
