import { describe, expect, it } from "vitest";
import { NO_EVIDENCE_TEXT, composeAnswer, validateCitations, type Evidence } from "../../../src/modules/agent/index.js";

function ev(i: number, text = `trecho ${i}`): Evidence {
  return {
    messageId: `00000000-0000-4000-8000-00000000000${i}`,
    chunkText: text,
    score: 1,
    author: `Autor ${i}`,
    sourceTitle: `Grupo ${i}`,
    sentAt: new Date("2026-11-22T02:30:00.000Z"),
    kind: "text",
  };
}

describe("compositor determinístico de respostas", () => {
  it("usa o singular para uma mensagem", () => {
    expect(composeAnswer([ev(1)]).text).toBe(
      "Encontrei 1 mensagem sobre isso:\n\n1. Autor 1 em Grupo 1, 21/11/2026: “trecho 1” [1]",
    );
  });

  it("usa o plural e numera as citações em ordem", () => {
    const reply = composeAnswer([ev(1), ev(2)]);
    expect(reply.text.split("\n")).toEqual([
      "Encontrei 2 mensagens sobre isso:",
      "",
      "1. Autor 1 em Grupo 1, 21/11/2026: “trecho 1” [1]",
      "2. Autor 2 em Grupo 2, 21/11/2026: “trecho 2” [2]",
    ]);
    expect(reply.citations.map((c) => c.index)).toEqual([1, 2]);
  });

  it("data no fuso de São Paulo (02:30 UTC ainda é dia 21)", () => {
    expect(composeAnswer([ev(1)]).text).toContain("21/11/2026");
  });

  it("junta espaços e quebras de linha do trecho", () => {
    expect(composeAnswer([ev(1, "  linha um\n\n  linha   dois ")]).text).toContain("“linha um linha dois”");
  });

  it("mantém trecho de 280 caracteres e encurta o que passar disso", () => {
    expect(composeAnswer([ev(1, "a".repeat(280))]).text).toContain(`“${"a".repeat(280)}”`);
    const long = composeAnswer([ev(1, "b".repeat(300))]).text;
    expect(long).toContain(`“${"b".repeat(279)}…”`);
  });

  it("sem evidências, responde 'não encontrei'", () => {
    expect(composeAnswer([])).toEqual({ text: NO_EVIDENCE_TEXT, outcome: "no_evidence", citations: [] });
  });

  it("aceita 'no_evidence' sem citações na validação", () => {
    expect(validateCitations([], [], "no_evidence")).toBe(true);
  });
});
