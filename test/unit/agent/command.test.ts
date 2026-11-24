// T005 (feature 006): reconhecimento dos comandos de gestão e do código de verificação.
import { describe, expect, it } from "vitest";
import { normalizeText, parseCommand, parseVerificationCode } from "../../../src/modules/agent/domain/command.js";

describe("parseCommand", () => {
  it.each([
    ["grupos", { kind: "list" }],
    ["Meus grupos!", { kind: "list" }],
    ["listar grupos", { kind: "list" }],
    ["conversas", { kind: "list" }],
    ["  MAIS ", { kind: "more" }],
    ["acompanhar 4", { kind: "follow", ref: "4" }],
    ["Acompanhar Projeto X", { kind: "follow", ref: "projeto x" }],
    ["parar T3", { kind: "stop", ref: "t3" }],
    ["parar de acompanhar Família", { kind: "stop", ref: "familia" }],
    ["apagar Contas da Casa.", { kind: "delete", ref: "contas da casa" }],
    ["confirmo apagar T3", { kind: "confirm_delete", name: "t3" }],
    ["Confirmo", { kind: "confirm" }],
    ["confirmo.", { kind: "confirm" }],
  ])("%s", (text, expected) => {
    expect(parseCommand(text)).toEqual(expected);
  });

  it.each(["quem falou de grupos?", "acompanhar", "apagar", "confirmo que sim", "vamos parar", "em qual áudio do T3 falaram de X?", "482913"])(
    "não é comando: %s",
    (text) => {
      expect(parseCommand(text)).toBeNull();
    },
  );
});

describe("normalizeText", () => {
  it("minúsculas, sem acento, sem pontuação e espaços colapsados", () => {
    expect(normalizeText("  Família — São   João! ")).toBe("familia sao joao");
    expect(normalizeText("T3 - Titanium Tech")).toBe("t3 titanium tech");
  });
});

describe("parseVerificationCode", () => {
  it("aceita 6 dígitos com ou sem espaço", () => {
    expect(parseVerificationCode("482913")).toBe("482913");
    expect(parseVerificationCode(" 482 913 ")).toBe("482913");
  });

  it.each(["48291", "4829134", "abc123", "grupos", ""])("recusa %s", (text) => {
    expect(parseVerificationCode(text)).toBeNull();
  });
});
