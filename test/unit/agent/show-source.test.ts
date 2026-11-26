// T010 (feature 008, interfaces/comando-mostrar.md §2): o serviço de "mostra a N", com dublês e relógio injetado.
import { describe, expect, it } from "vitest";
import { CITATIONS_TTL_MS, createShowSource, type CitationStore, type ShowSourceOutcome, type StoredCitations } from "../../../src/modules/agent/index.js";
import type { SourceContext, SourceContextResult } from "../../../src/modules/retrieval/index.js";

const ID = "6f1c8a52-1d3e-4a4b-9a0e-2b4f0c9d7e11";
const AT = new Date("2026-11-25T21:00:00Z");
const ctx = { userId: "u1", spaceId: "s1", provider: "fake" };

const found: SourceContextResult = {
  status: "found",
  message: { messageId: ID, author: "Ana", sourceTitle: "T3", sentAt: new Date("2026-11-12T17:32:00Z"), kind: "text", text: "Recomendo o Temporal." },
  before: [],
  after: [],
};

function setup(options: { stored?: StoredCitations | null; result?: SourceContextResult; now?: Date } = {}) {
  const asked: string[] = [];
  const outcomes: ShowSourceOutcome[] = [];
  const citations: CitationStore = { citations: async () => (options.stored === undefined ? { items: [{ index: 1, messageId: ID, kind: "text" }, { index: 2, messageId: "outra", kind: "text" }], at: AT } : options.stored), saveCitations: async () => undefined };
  const context: SourceContext = { around: async (spaceId, messageId, k) => (asked.push(`${spaceId}|${messageId}|${k}`), options.result ?? found) };
  const show = createShowSource({ citations, context, observer: { shown: (o) => void outcomes.push(o) }, now: () => options.now ?? new Date(AT.getTime() + 60_000) });
  return { show, asked, outcomes };
}

describe("serviço de 'mostra a N'", () => {
  it("mostra a citação pedida, buscando 3 vizinhas no espaço do dono", async () => {
    const { show, asked, outcomes } = setup();
    const reply = await show(ctx, 1);
    expect(reply.text).toContain("[1] Ana em T3");
    expect(reply.citations[0]).toMatchObject({ index: 1, messageId: ID });
    expect(asked).toEqual([`s1|${ID}|3`]);
    expect(outcomes).toEqual(["shown"]);
  });

  it("sem lista, ou com a lista de mais de 2 h, é no_recent e não busca nada", async () => {
    for (const option of [{ stored: null }, { now: new Date(AT.getTime() + CITATIONS_TTL_MS) }]) {
      const { show, asked, outcomes } = setup(option);
      expect((await show(ctx, 1)).text).toContain("Não tenho citações recentes");
      expect(asked).toEqual([]);
      expect(outcomes).toEqual(["no_recent"]);
    }
    const { show } = setup({ now: new Date(AT.getTime() + CITATIONS_TTL_MS - 1) });
    expect((await show(ctx, 1)).outcome).toBe("answered");
  });

  it("número maior que a lista é out_of_range", async () => {
    const { show, asked, outcomes } = setup();
    expect((await show(ctx, 3)).text).toBe('A última resposta tem só 2 citações. Mande "mostra a 1" até "mostra a 2".');
    expect(asked).toEqual([]);
    expect(outcomes).toEqual(["out_of_range"]);
  });

  it.each([
    ["deleted", "Essa conversa foi apagada"],
    ["not_found", "Não encontrei mais essa mensagem."],
  ] as const)("mensagem %s tem a sua resposta", async (status, text) => {
    const { show, outcomes } = setup({ result: { status } });
    expect((await show(ctx, 2)).text).toContain(text);
    expect(outcomes).toEqual([status]);
  });

  it("a faixa do trecho de áudio guardada chega ao compositor", async () => {
    const audio: SourceContextResult = {
      ...found,
      message: {
        ...(found.status === "found" ? found.message : ({} as never)),
        kind: "audio",
        text: "",
        audio: { attachmentId: "0a05cfd1-7a02-4687-86d3-dbe8526cf836", mimeType: "audio/ogg", sizeBytes: 10, durationSeconds: 60, stored: true, processing: "done", segments: [{ start: 30, end: 40, text: "o SLA caiu" }] },
      },
    };
    const { show } = setup({ stored: { items: [{ index: 1, messageId: ID, kind: "audio", audioStartS: 30, audioEndS: 40 }], at: AT }, result: audio });
    const reply = await show(ctx, 1);
    expect(reply.text).toContain("» 0:30 o SLA caiu");
    expect(reply.media?.[0]?.ref).toBe("0a05cfd1-7a02-4687-86d3-dbe8526cf836");
  });
});
