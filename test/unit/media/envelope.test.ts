// T007 (feature 005, D-05): envelope AES-256-GCM dos objetos de mídia.
import { describe, expect, it } from "vitest";
import { ENVELOPE_VERSION, EnvelopeError, isSealed, open, seal } from "../../../src/modules/media/infrastructure/object-store/envelope.js";

const key = Buffer.alloc(32, 3);
const plain = new TextEncoder().encode("áudio em claro");

describe("envelope de mídia", () => {
  it("cifra e decifra; formato versão | IV de 12 | cifra | tag de 16", () => {
    const sealed = seal(plain, key);
    expect(sealed[0]).toBe(ENVELOPE_VERSION);
    expect(sealed.length).toBe(1 + 12 + plain.length + 16);
    expect(sealed.includes(Buffer.from(plain))).toBe(false);
    expect(isSealed(sealed)).toBe(true);
    expect(Buffer.from(open(sealed, key)).equals(Buffer.from(plain))).toBe(true);
  });

  it("IV aleatório: o mesmo conteúdo cifrado duas vezes difere", () => {
    expect(seal(plain, key).equals(seal(plain, key))).toBe(false);
  });

  it("tag adulterada ou chave errada falham sem revelar o conteúdo", () => {
    const sealed = seal(plain, key);
    sealed[sealed.length - 1] = (sealed[sealed.length - 1] ?? 0) ^ 0xff;
    expect(() => open(sealed, key)).toThrow(EnvelopeError);
    expect(() => open(seal(plain, key), Buffer.alloc(32, 4))).toThrow(/adulterado ou chave errada/);
  });

  it("recusa objeto sem envelope e chave de tamanho errado", () => {
    expect(() => open(plain, key)).toThrow(/sem o envelope/);
    expect(isSealed(plain)).toBe(false);
    expect(() => seal(plain, Buffer.alloc(16))).toThrow(/32 bytes/);
  });
});
