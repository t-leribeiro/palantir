// T006 (feature 006): lista paginada e resolução da referência a uma conversa (D-04, D-15).
import { describe, expect, it } from "vitest";
import {
  LISTING_TTL_MS,
  PAGE_SIZE,
  ambiguityText,
  listingPage,
  resolveRef,
  type ListItem,
} from "../../../src/modules/agent/domain/conversation-ref.js";

const item = (n: number, title: string, state: ListItem["state"] = "not_following"): ListItem => ({ ref: `group:${n}`, title, state });
const items = [item(1, "Contas da Casa", "following"), item(2, "Contas do Prédio"), item(3, "Família"), item(4, "T3", "imported")];
const now = new Date("2026-11-24T20:00:00Z");
const snapshot = { items, at: new Date(now.getTime() - 60_000) };

describe("listingPage", () => {
  it("numera, mostra o estado e oferece 'mais' quando há outra página", () => {
    const many = Array.from({ length: 35 }, (_, i) => item(i, `Grupo ${String(i + 1).padStart(2, "0")}`));
    const first = listingPage(many, 1);
    expect(first.text.split("\n")[0]).toBe("Seus grupos e conversas (1–30 de 35):");
    expect(first.text).toContain("1. Grupo 01 · não acompanhado");
    expect(first.text).toContain('Mande "mais" para ver o resto.');
    expect(first.hasMore).toBe(true);
    const second = listingPage(many, 2);
    expect(second.text).toContain("31. Grupo 31 · não acompanhado");
    expect(second.hasMore).toBe(false);
    expect(second.text).not.toContain("mais");
    expect(listingPage(many, 3).text).toBe("Não há mais itens.");
    expect(PAGE_SIZE).toBe(30);
  });

  it("rótulos de todos os estados e a lista vazia", () => {
    const text = listingPage(
      [item(1, "A", "following"), item(2, "B", "stopped"), item(3, "C", "imported"), item(4, "D", "conversation"), item(5, "E", "other_account")],
      1,
    ).text;
    expect(text).toContain("A · acompanhando");
    expect(text).toContain("B · parado");
    expect(text).toContain("C · importada");
    expect(text).toContain("D · conversa");
    expect(text).toContain("E · acompanhado por outra conta");
    expect(listingPage([], 1).text).toContain("Você ainda não tem grupos nem conversas");
  });
});

describe("resolveRef", () => {
  it("número da lista vigente", () => {
    expect(resolveRef("3", items, snapshot, now)).toEqual({ kind: "found", item: items[2] });
  });

  it("número de lista vencida, ausente ou fora do intervalo pede a lista de novo", () => {
    const old = { items, at: new Date(now.getTime() - LISTING_TTL_MS - 1) };
    expect(resolveRef("3", items, old, now)).toEqual({ kind: "stale_number" });
    expect(resolveRef("3", items, null, now)).toEqual({ kind: "stale_number" });
    expect(resolveRef("9", items, snapshot, now)).toEqual({ kind: "stale_number" });
  });

  it("item da lista que sumiu desde então não é encontrado", () => {
    expect(resolveRef("3", items.filter((i) => i.title !== "Família"), snapshot, now)).toEqual({ kind: "not_found" });
  });

  it("nome exato (sem acento e caixa) ganha do trecho", () => {
    expect(resolveRef("familia", items, null, now)).toEqual({ kind: "found", item: items[2] });
    expect(resolveRef("t3", items, null, now)).toEqual({ kind: "found", item: items[3] });
  });

  it("trecho único encontra; trecho de várias é ambíguo; nada é não encontrado", () => {
    expect(resolveRef("prédio", items, null, now)).toEqual({ kind: "found", item: items[1] });
    expect(resolveRef("contas", items, null, now)).toEqual({ kind: "ambiguous", candidates: [items[0], items[1]] });
    expect(resolveRef("xyz", items, null, now)).toEqual({ kind: "not_found" });
    expect(resolveRef("!!", items, null, now)).toEqual({ kind: "not_found" });
  });
});

describe("ambiguityText", () => {
  it("lista as opções numeradas", () => {
    expect(ambiguityText([items[0] as ListItem, items[1] as ListItem])).toBe(
      "Encontrei mais de uma: 1. Contas da Casa · 2. Contas do Prédio. Repita com o número ou o nome completo.",
    );
  });
});
