// T009 (feature 009, D-09, D-10): tema normalizado e serviço dos itens guardados, com dublê do armazenamento.
import { describe, expect, it } from "vitest";
import {
  InvalidThemeError,
  LISTING_LIMIT,
  createSavedItems,
  normalizeTheme,
  parseTheme,
  type SavedContent,
  type SavedItemStore,
} from "../../../src/modules/knowledge/index.js";

describe("tema", () => {
  it("normaliza maiúsculas, acentos, pontuação e espaços", () => {
    expect(normalizeTheme("  Arquitetura   de Software! ")).toBe("arquitetura de software");
    expect(normalizeTheme("Decisões")).toBe(normalizeTheme("decisoes"));
  });

  it("guarda o nome como o dono escreveu e recusa vazio ou acima de 60 caracteres", () => {
    expect(parseTheme("  Arquitetura  de Software ")).toEqual({ name: "Arquitetura de Software", normalized: "arquitetura de software" });
    expect(parseTheme(" ?! ")).toBe("empty");
    expect(parseTheme("x".repeat(61))).toBe("too_long");
    expect(parseTheme("x".repeat(60))).not.toBe("too_long");
  });
});

function fakeStore(contents: readonly SavedContent[]): SavedItemStore & { normalizedAsked: string[] } {
  const normalizedAsked: string[] = [];
  return {
    normalizedAsked,
    async themeContents(_space, normalized) {
      normalizedAsked.push(normalized);
      return contents;
    },
    attach: async (_space, theme) => ({ itemId: "item-1", theme: theme.name }),
    async listTheme(_space, normalized, limit) {
      normalizedAsked.push(`${normalized}:${limit}`);
      return { theme: "Leituras", total: 0, items: [] };
    },
    listThemes: async () => [],
    themeName: async (_space, normalized) => (normalized === "leituras" ? "Leituras" : null),
    savedMessage: async () => null,
    forget: async () => null,
  };
}

describe("itens guardados", () => {
  it("acha a duplicata pelo texto normalizado e pelo SHA-256, nunca misturando os dois", async () => {
    const saved = createSavedItems(fakeStore([{ text: "O Temporal resolveu os workflows." }, { sha256: "a".repeat(64) }]));
    expect(await saved.isDuplicate("s", "Arquitetura", { text: "o temporal resolveu os workflows" })).toBe(true);
    expect(await saved.isDuplicate("s", "Arquitetura", { sha256: "a".repeat(64) })).toBe(true);
    expect(await saved.isDuplicate("s", "Arquitetura", { sha256: "b".repeat(64) })).toBe(false);
    expect(await saved.isDuplicate("s", "Arquitetura", { text: "outro texto" })).toBe(false);
  });

  it("consulta o tema pela forma normalizada e lista no máximo 9 itens", async () => {
    const store = fakeStore([]);
    const saved = createSavedItems(store);
    await saved.isDuplicate("s", "Arquitetura de Software", { text: "x" });
    await saved.listTheme("s", "LEITURAS");
    expect(store.normalizedAsked).toEqual(["arquitetura de software", `leituras:${LISTING_LIMIT}`]);
  });

  it("mostra o tema com o nome da primeira vez, ou como o dono escreveu se é novo", async () => {
    const saved = createSavedItems(fakeStore([]));
    expect(await saved.displayName("s", "LEITURAS")).toBe("Leituras");
    expect(await saved.displayName("s", " Finanças ")).toBe("Finanças");
  });

  it("tema inválido não tem duplicata, lista vazio e recusa guardar", async () => {
    const saved = createSavedItems(fakeStore([{ text: "x" }]));
    expect(await saved.isDuplicate("s", "  ", { text: "x" })).toBe(false);
    expect(await saved.listTheme("s", "  ")).toEqual({ theme: null, total: 0, items: [] });
    await expect(saved.save("s", "x".repeat(61), "m")).rejects.toBeInstanceOf(InvalidThemeError);
  });
});
