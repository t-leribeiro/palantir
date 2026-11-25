// T004 (feature 007, D-11): embedder falso determinístico para a esteira.
import { describe, expect, it } from "vitest";
import { EmbedderError, cosine, createFakeEmbedder } from "../../../src/modules/knowledge/index.js";
import { TEST_CONCEPTS } from "../../support/embedding-concepts.js";

const embedder = createFakeEmbedder({ concepts: TEST_CONCEPTS });

async function similarity(a: string, b: string): Promise<number> {
  const [x, y] = await embedder.embed([a, b], "document");
  return cosine(x ?? [], y ?? []);
}

describe("embedder falso", () => {
  it("paráfrases do léxico ficam próximas; assunto diferente fica longe", async () => {
    expect(await similarity("quem sugeriu algo para coordenar processos demorados?", "Recomendo o Temporal para orquestrar workflows de longa duração")).toBeGreaterThan(0.6);
    expect(await similarity("cortar gastos com a nuvem", "o Karpenter reduziu em 30% o custo do nosso cluster")).toBeGreaterThan(0.6);
    expect(await similarity("alguém usou um sistema de mensageria distribuída?", "O Grafana Alloy centraliza a coleta de telemetria")).toBeLessThan(0.3);
  });

  it("vetores normalizados, na ordem, com a dimensão anunciada; determinístico", async () => {
    const [a, b] = await embedder.embed(["custo do cluster", "custo do cluster"], "query");
    expect(a).toHaveLength(embedder.dimensions);
    expect(a).toEqual(b);
    expect(Math.hypot(...(a ?? []))).toBeCloseTo(1, 6);
  });

  it("fora do ar, falha com EmbedderError sem texto", async () => {
    const down = createFakeEmbedder({ concepts: TEST_CONCEPTS, down: () => true });
    await expect(down.embed(["custo"], "document")).rejects.toBeInstanceOf(EmbedderError);
    expect(await down.health()).toBe(false);
  });
});
