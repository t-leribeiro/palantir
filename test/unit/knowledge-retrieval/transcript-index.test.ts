// T012 (feature 005, D-14): trechos da transcrição com a faixa do áudio.
import { describe, expect, it } from "vitest";
import { createIndexMessage, transcriptBlocks, type Chunk, type IndexableMessage } from "../../../src/modules/knowledge/index.js";

describe("transcriptBlocks", () => {
  it("agrupa segmentos até o limite sem quebrar segmento, com início do primeiro e fim do último", () => {
    const segments = [
      { start: 0, end: 4, text: " bom dia " },
      { start: 4, end: 9.5, text: "hoje vou falar do Temporal" },
      { start: 9.5, end: 15, text: "e depois do Kubernetes" },
    ];
    expect(transcriptBlocks(segments, 40)).toEqual([
      { text: "bom dia hoje vou falar do Temporal", start: 0, end: 9.5 },
      { text: "e depois do Kubernetes", start: 9.5, end: 15 },
    ]);
  });

  it("segmento maior que o limite vira um bloco sozinho; segmentos vazios saem", () => {
    const long = "x".repeat(50);
    expect(transcriptBlocks([{ start: 0, end: 1, text: "  " }, { start: 1, end: 9, text: long }, { start: 9, end: 10, text: "fim" }], 20)).toEqual([
      { text: long, start: 1, end: 9 },
      { text: "fim", start: 9, end: 10 },
    ]);
    expect(transcriptBlocks([])).toEqual([]);
  });
});

function indexer(message: IndexableMessage) {
  let chunks: Chunk[] = [];
  const index = createIndexMessage({
    loadMessage: async () => message,
    replaceChunks: async (_id, replaced) => {
      chunks = [...replaced];
    },
  });
  return { index, chunks: () => chunks };
}

describe("indexar áudio transcrito", () => {
  const segments = [
    { start: 0, end: 5, text: "orçamento do trimestre" },
    { start: 5, end: 12, text: "precisamos cortar custos de nuvem" },
  ];

  it("áudio sem legenda: só os blocos da transcrição, com a faixa", async () => {
    const s = indexer({ messageId: "m", spaceId: "s", text: null, segments });
    expect(await s.index({ messageId: "m", spaceId: "s" })).toBe("indexed");
    expect(s.chunks()).toEqual([
      { spaceId: "s", messageId: "m", idx: 0, text: "orçamento do trimestre precisamos cortar custos de nuvem", audioStartS: 0, audioEndS: 12 },
    ]);
  });

  it("áudio com legenda: trecho 0 com a legenda e depois os blocos", async () => {
    const s = indexer({ messageId: "m", spaceId: "s", text: "reunião", segments });
    await s.index({ messageId: "m", spaceId: "s" });
    expect(s.chunks().map((c) => [c.idx, c.text.slice(0, 9), c.audioStartS])).toEqual([
      [0, "reunião", undefined],
      [1, "orçamento", 0],
    ]);
  });

  it("áudio ainda sem transcrição e sem legenda: nada a indexar", async () => {
    expect(await indexer({ messageId: "m", spaceId: "s", text: null, segments: [] }).index({ messageId: "m", spaceId: "s" })).toBe("skipped_no_text");
  });
});
