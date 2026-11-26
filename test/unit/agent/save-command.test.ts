// T006 (feature 009, D-06): guardar, listar e esquecer por palavras fixas.
import { describe, expect, it } from "vitest";
import { parseForget, parseSave, parseSavedListing } from "../../../src/modules/agent/domain/save-command.js";

describe("guardar", () => {
  it("reconhece as formas com tema, sem diferenciar maiúsculas", () => {
    expect(parseSave("guarda isso em Arquitetura")).toEqual({ kind: "save", theme: "Arquitetura" });
    expect(parseSave("Guarda em arquitetura de software.")).toEqual({ kind: "save", theme: "arquitetura de software" });
    expect(parseSave("GUARDAR EM Decisões")).toEqual({ kind: "save", theme: "Decisões" });
  });

  it("separa o conteúdo no primeiro dois-pontos, preservando a URL", () => {
    expect(parseSave("guarda em leituras: https://exemplo.com/filas artigo sobre filas")).toEqual({
      kind: "save",
      theme: "leituras",
      content: "https://exemplo.com/filas artigo sobre filas",
    });
    expect(parseSave("guarda em leituras:   ")).toEqual({ kind: "save", theme: "leituras" });
  });

  it("sem tema, pede o tema", () => {
    expect(parseSave("guarda isso")).toEqual({ kind: "ask_theme" });
    expect(parseSave("guarda")).toEqual({ kind: "ask_theme" });
    expect(parseSave("guardar em ")).toEqual({ kind: "ask_theme" });
    expect(parseSave("guarda em : só o texto")).toEqual({ kind: "ask_theme" });
  });

  it("perguntas com a palavra continuam perguntas", () => {
    expect(parseSave("como guardar senhas no cofre?")).toBeNull();
    expect(parseSave("guardar senhas é seguro?")).toBeNull();
    expect(parseSave("guardei a senha onde?")).toBeNull();
    expect(parseSave("guardados arquitetura")).toBeNull();
  });
});

describe("listar", () => {
  it("lista os temas", () => {
    for (const text of ["temas", "Meus temas", "guardados", "meus guardados"]) expect(parseSavedListing(text)).toEqual({ kind: "themes" });
  });

  it("lista um tema pelas formas aceitas, com o nome como foi escrito", () => {
    expect(parseSavedListing("guardados Arquitetura")).toEqual({ kind: "theme", theme: "Arquitetura" });
    expect(parseSavedListing("o que guardei sobre finanças?")).toEqual({ kind: "theme", theme: "finanças" });
    expect(parseSavedListing("O que eu guardei em leituras")).toEqual({ kind: "theme", theme: "leituras" });
    expect(parseSavedListing("guardados sobre reuniões")).toEqual({ kind: "theme", theme: "reuniões" });
  });

  it("perguntas sobre outra coisa não são listagem", () => {
    expect(parseSavedListing("o que falaram sobre guardados?")).toBeNull();
    expect(parseSavedListing("quem guardou o documento?")).toBeNull();
  });
});

describe("esquecer", () => {
  it("reconhece de 1 a 9", () => {
    expect(parseForget("esquece a 2")).toBe(2);
    expect(parseForget("Esquecer 9")).toBe(9);
    expect(parseForget("esquece o 1")).toBe(1);
  });

  it("fora do formato não é comando", () => {
    expect(parseForget("esquece a 10")).toBeNull();
    expect(parseForget("esquece isso")).toBeNull();
    expect(parseForget("não esquece a 2")).toBeNull();
  });
});
