import { describe, expect, it } from "vitest";
import { MAX_INDEXED_CHARS, createIndexMessage, type Chunk, type IndexableMessage } from "../../../src/modules/knowledge/index.js";
import {
  MAX_LIMIT,
  bestPerMessage,
  createSearchEvidence,
  isLowConfidence,
  type Evidence,
} from "../../../src/modules/retrieval/index.js";

function indexer(message: IndexableMessage | null) {
  const chunks: Chunk[] = [];
  const index = createIndexMessage({
    loadMessage: async () => message,
    replaceChunks: async (_messageId, replaced) => {
      chunks.splice(0, chunks.length, ...replaced);
    },
  });
  return { index, chunks };
}

describe("knowledge: indexar mensagem", () => {
  it("cria um chunk por mensagem com o texto", async () => {
    const { index, chunks } = indexer({ messageId: "m1", spaceId: "s1", text: "  Grafana Alloy  " });
    expect(await index({ messageId: "m1", spaceId: "s1" })).toBe("indexed");
    expect(chunks).toEqual([{ spaceId: "s1", messageId: "m1", idx: 0, text: "Grafana Alloy" }]);
  });

  it("ignora mensagem inexistente, sem texto ou de outro espaço", async () => {
    expect(await indexer(null).index({ messageId: "m1", spaceId: "s1" })).toBe("skipped_missing");
    expect(await indexer({ messageId: "m1", spaceId: "s1", text: null }).index({ messageId: "m1", spaceId: "s1" })).toBe(
      "skipped_no_text",
    );
    expect(await indexer({ messageId: "m1", spaceId: "s1", text: "   " }).index({ messageId: "m1", spaceId: "s1" })).toBe(
      "skipped_no_text",
    );
    const other = indexer({ messageId: "m1", spaceId: "s2", text: "x" });
    expect(await other.index({ messageId: "m1", spaceId: "s1" })).toBe("skipped_space_mismatch");
    expect(other.chunks).toEqual([]);
  });

  it("trunca textos acima do limite", async () => {
    const { index, chunks } = indexer({ messageId: "m1", spaceId: "s1", text: "a".repeat(MAX_INDEXED_CHARS + 5) });
    await index({ messageId: "m1", spaceId: "s1" });
    expect(chunks[0]?.text).toHaveLength(MAX_INDEXED_CHARS);
  });
});

function ev(messageId: string, score: number): Evidence {
  return { messageId, score, chunkText: "t", author: "a", sourceTitle: "s", sentAt: new Date(0), kind: "text" };
}

describe("retrieval: buscar evidências", () => {
  function search(results: Evidence[], threshold = 0.05) {
    const calls: [string, string, number, ...string[]][] = [];
    const run = createSearchEvidence({
      index: {
        search: async (spaceId, query, limit, kind) => {
          calls.push(kind ? [spaceId, query, limit, kind] : [spaceId, query, limit]);
          return results;
        },
      },
      lowConfidenceThreshold: threshold,
    });
    return { run, calls };
  }

  it("exige o espaço do usuário", async () => {
    await expect(search([]).run({ spaceId: " ", query: "x" })).rejects.toMatchObject({ code: "space_required" });
  });

  it("não consulta o índice com pergunta vazia", async () => {
    const { run, calls } = search([ev("m1", 1)]);
    expect(await run({ spaceId: "s1", query: "   " })).toEqual({ results: [], lowConfidence: true });
    expect(calls).toEqual([]);
  });

  it("passa espaço, consulta e limite ao índice, limitando o máximo", async () => {
    const { run, calls } = search([ev("m1", 1)]);
    await run({ spaceId: "s1", query: " alloy ", limit: 500 });
    await run({ spaceId: "s1", query: "alloy" });
    expect(calls).toEqual([
      ["s1", "alloy", MAX_LIMIT],
      ["s1", "alloy", 10],
    ]);
  });

  it("E001: repassa o tipo pedido ao índice", async () => {
    const { run, calls } = search([ev("m1", 1)]);
    await run({ spaceId: "s1", query: "temporal", kind: "audio" });
    expect(calls).toEqual([["s1", "temporal", 10, "audio"]]);
  });

  it("sinaliza baixa confiança abaixo do limiar e confiança no limiar", async () => {
    expect((await search([ev("m1", 0.01)]).run({ spaceId: "s1", query: "x" })).lowConfidence).toBe(true);
    expect((await search([ev("m1", 0.05)]).run({ spaceId: "s1", query: "x" })).lowConfidence).toBe(false);
    expect(isLowConfidence([], 0)).toBe(true);
  });

  it("devolve cada mensagem uma vez, com o melhor trecho, por score", () => {
    expect(bestPerMessage([ev("m1", 0.2), ev("m2", 0.5), ev("m1", 0.9)]).map((e) => [e.messageId, e.score])).toEqual([
      ["m1", 0.9],
      ["m2", 0.5],
    ]);
  });
});
