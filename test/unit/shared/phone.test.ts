// T005: número em E.164 com o nono dígito brasileiro (D-07) e máscara para logs (RNF de privacidade).
import { describe, expect, it } from "vitest";
import { maskPhone, normalizePhone } from "../../../src/shared/phone.js";

describe("normalizePhone", () => {
  it("aceita formatos comuns e devolve E.164", () => {
    expect(normalizePhone("+55 11 98888-7777")).toBe("+5511988887777");
    expect(normalizePhone("+55 (11) 98888-7777")).toBe("+5511988887777");
    expect(normalizePhone("5511988887777")).toBe("+5511988887777");
    expect(normalizePhone("+1 (415) 555-2671")).toBe("+14155552671");
  });

  it("insere o nono dígito em celular brasileiro antigo (8 dígitos começando por 6 a 9)", () => {
    expect(normalizePhone("551188887777")).toBe("+5511988887777");
    expect(normalizePhone("+55 21 7777-6666")).toBe("+5521977776666");
  });

  it("não mexe em fixo brasileiro (8 dígitos começando por 2 a 5)", () => {
    expect(normalizePhone("+55 11 3333-4444")).toBe("+551133334444");
  });

  it("recusa o que não é número internacional", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("+12")).toBeNull();
    expect(normalizePhone("+1234567890123456")).toBeNull();
    expect(normalizePhone("+55 11 98888-7777 ramal 2")).toBeNull();
    expect(normalizePhone("+0 11 98888-7777")).toBeNull();
  });
});

describe("maskPhone", () => {
  it("mostra só DDI, DDD, o primeiro e os 2 últimos dígitos de um celular brasileiro", () => {
    expect(maskPhone("+5511988887777")).toBe("+55 11 9****-**77");
  });

  it("mostra só os 2 primeiros e os 2 últimos dígitos de outros números", () => {
    expect(maskPhone("+14155552671")).toBe("+14*******71");
  });

  it("nunca devolve o número inteiro", () => {
    for (const phone of ["+5511988887777", "+551133334444", "+14155552671", "+123456789"]) {
      expect(maskPhone(phone)).not.toContain(phone.slice(1));
    }
  });
});
