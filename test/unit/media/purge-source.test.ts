// T012 (feature 006): purga dos arquivos de mídia por fonte (D-08).
import { describe, expect, it } from "vitest";
import { createMediaPurger, sourcePrefix } from "../../../src/modules/media/index.js";

describe("purga por fonte", () => {
  it("apaga só o prefixo <space>/<source>/", async () => {
    const prefixes: string[] = [];
    const purger = createMediaPurger({ deletePrefix: async (prefix) => (prefixes.push(prefix), 3) });
    expect(await purger.purgeSource("space-1", "source-1")).toBe(3);
    expect(prefixes).toEqual(["space-1/source-1/"]);
  });

  it.each([["", "s"], ["e", ""], ["e/x", "s"], ["e", "s/.."]])("recusa espaço ou fonte vazios ou com barra (%s, %s)", (space, source) => {
    expect(() => sourcePrefix(space, source)).toThrow("espaço e fonte");
  });
});
