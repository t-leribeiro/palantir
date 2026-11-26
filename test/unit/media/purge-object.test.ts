// T018 (feature 009, D-13): purga de um arquivo esquecido, só pela chave exata e só sem referência.
import { describe, expect, it } from "vitest";
import { createPurgeObject, isObjectKey } from "../../../src/modules/media/index.js";

const KEY = `6f1c8a52-1d3e-4a4b-9a0e-2b4f0c9d7e11/7a2d9b63-2e4f-4b5c-8b1f-3c5a1d0e8f22/${"a".repeat(64)}`;

function setup(referenced: boolean) {
  const deleted: string[] = [];
  const purge = createPurgeObject({
    store: {
      async deletePrefix(prefix) {
        deleted.push(prefix);
        return 1;
      },
    },
    isReferenced: async () => referenced,
  });
  return { purge, deleted };
}

describe("purga de um arquivo", () => {
  it("apaga a chave sem referência", async () => {
    const { purge, deleted } = setup(false);
    expect(await purge({ key: KEY })).toBe("purged");
    expect(deleted).toEqual([KEY]);
  });

  it("mantém a chave que voltou a ser usada", async () => {
    const { purge, deleted } = setup(true);
    expect(await purge({ key: KEY })).toBe("kept");
    expect(deleted).toEqual([]);
  });

  it("recusa prefixo ou chave fora do formato", async () => {
    const { purge, deleted } = setup(false);
    for (const key of ["", "a/b/", KEY.slice(0, 80), `${KEY}/x`, KEY.replace(/a{64}$/, "")]) expect(await purge({ key })).toBe("invalid");
    expect(deleted).toEqual([]);
    expect(isObjectKey(KEY)).toBe(true);
  });
});
