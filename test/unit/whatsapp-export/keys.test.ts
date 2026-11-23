// T004: fuso horário (RF-06) e chave de importação determinística (RF-07; RN-02, RN-03).
import { describe, expect, it } from "vitest";
import { assignImportKeys, localToUtc } from "../../../src/channels/whatsapp-export/keys.js";

const at = (day: number, hour: number, minute: number, second = 0) => ({ year: 2026, month: 11, day, hour, minute, second });

describe("localToUtc", () => {
  it("São Paulo (UTC-3)", () => {
    expect(localToUtc(at(22, 10, 0), "America/Sao_Paulo").toISOString()).toBe("2026-11-22T13:00:00.000Z");
  });

  it("UTC", () => {
    expect(localToUtc(at(22, 10, 0), "UTC").toISOString()).toBe("2026-11-22T10:00:00.000Z");
  });

  it("Nova York considera horário de verão", () => {
    expect(localToUtc({ year: 2026, month: 7, day: 1, hour: 10, minute: 0, second: 0 }, "America/New_York").toISOString()).toBe(
      "2026-07-01T14:00:00.000Z",
    );
    expect(localToUtc(at(22, 10, 0), "America/New_York").toISOString()).toBe("2026-11-22T15:00:00.000Z");
  });

  it("recusa fuso inválido", () => {
    expect(() => localToUtc(at(22, 10, 0), "Marte/Olympus")).toThrow(/fuso/i);
  });
});

describe("assignImportKeys", () => {
  const msg = (author: string, text: string, minute = 0) => ({ conversation: "Comunidade DevOps", sentAt: new Date(Date.UTC(2026, 10, 22, 13, minute)), author, text });

  it("gera SHA-256 em hexadecimal, igual para a mesma entrada", () => {
    const [a] = assignImportKeys([msg("Ana", "oi")]);
    const [b] = assignImportKeys([msg("Ana", "oi")]);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
  });

  it("diferencia mensagens iguais no mesmo minuto pela ordem", () => {
    const keys = assignImportKeys([msg("Ana", "ok"), msg("Ana", "ok"), msg("Ana", "ok", 1)]);
    expect(new Set(keys).size).toBe(3);
  });

  it("mantém a chave quando outra exportação tem mensagens a mais em outros minutos", () => {
    const first = assignImportKeys([msg("Ana", "ok"), msg("Ana", "ok")]);
    const later = assignImportKeys([msg("Bia", "antes", 0), msg("Ana", "ok"), msg("Ana", "ok"), msg("Caio", "depois", 5)]);
    expect(later.slice(1, 3)).toEqual(first);
  });

  it("normaliza espaços e caixa do autor, não do texto", () => {
    expect(assignImportKeys([msg(" Ana ", "oi  tudo")])).toEqual(assignImportKeys([msg("ana", "oi tudo")]));
    expect(assignImportKeys([msg("Ana", "Oi")])).not.toEqual(assignImportKeys([msg("Ana", "oi")]));
  });

  it("muda com a conversa", () => {
    const other = { ...msg("Ana", "oi"), conversation: "Outra" };
    expect(assignImportKeys([other])).not.toEqual(assignImportKeys([msg("Ana", "oi")]));
  });
});
