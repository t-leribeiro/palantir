// T006 (feature 008, D-01, interfaces/comando-mostrar.md §1): "mostra a N" por palavras fixas, sem LLM.
import { describe, expect, it } from "vitest";
import { parseShowSource } from "../../../src/modules/agent/domain/show-source.js";

describe("comando 'mostra a N'", () => {
  it.each([
    ["mostra a 2", 2],
    ["Mostra a 2", 2],
    ["mostra 2", 2],
    ["mostrar 1", 1],
    ["ver 3", 3],
    ["ver a 1", 1],
    ["original 2", 2],
    ["  MOSTRA  A  2!  ", 2],
  ])("%j é o comando da citação %i", (text, index) => {
    expect(parseShowSource(text)).toBe(index);
  });

  it.each(["me mostra o que a Ana disse", "mostra tudo", "ver 10", "ver 0", "mostra a", "quem me mostrou o Temporal?", "2"])(
    "%j não é o comando",
    (text) => {
      expect(parseShowSource(text)).toBeNull();
    },
  );
});
