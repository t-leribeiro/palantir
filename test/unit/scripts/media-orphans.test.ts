// T023 (feature 006): conferência de objetos de mídia sem conversa.
import { describe, expect, it } from "vitest";
import { countOrphans, sourceOfKey } from "../../../scripts/media/orphans.js";

describe("objetos sem conversa", () => {
  it("lê a fonte da chave <space>/<source>/<sha256>", () => {
    expect(sourceOfKey("sp/src-1/abc")).toBe("src-1");
    expect(sourceOfKey("solto")).toBeNull();
    expect(sourceOfKey("sp//abc")).toBeNull();
  });

  it("conta chaves de fontes apagadas e chaves fora do formato", () => {
    const keys = ["sp/a/1", "sp/a/2", "sp/b/1", "solto"];
    expect(countOrphans(keys, new Set(["a", "b"]))).toBe(1);
    expect(countOrphans(keys, new Set(["a"]))).toBe(2);
    expect(countOrphans([], new Set())).toBe(0);
  });
});
