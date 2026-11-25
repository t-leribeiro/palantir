// T006 (feature 007): busca combinada com PostgreSQL real e o embedder falso (requirements.md#7; RN-02, RN-03, RN-04,
// RF-02 a RF-04, D-07 a D-09).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOperator } from "../../src/main/seed-data.js";
import {
  createActiveModelQueryEmbedding,
  createFakeEmbedder,
  createPgEmbeddingRepository,
  createSweepEmbeddings,
  type Embedder,
  type EmbeddingStore,
} from "../../src/modules/knowledge/index.js";
import { createPgSearchIndex, createSearchEvidence, type SearchEvidence } from "../../src/modules/retrieval/index.js";
import { insertMessageWithChunk } from "../support/chunks.js";
import { TEST_CONCEPTS } from "../support/embedding-concepts.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";

let db: TestDatabase;
let store: EmbeddingStore;
let search: SearchEvidence;
let degradedSearch: SearchEvidence;
let space: { spaceId: string; sourceId: string };
let other: { spaceId: string; sourceId: string };
let t3SourceId: string;
const ids: Record<string, string> = {};
const embedder: Embedder = createFakeEmbedder({ concepts: TEST_CONCEPTS });
const embedderFor = () => embedder;

beforeAll(async () => {
  db = await startTestDatabase();
  space = await seedOperator(db.pool);
  t3SourceId = (await seedOperator(db.pool, { conversationId: "t3", conversationTitle: "T3" })).sourceId;
  other = await seedOperator(db.pool, { provider: "fake", accountId: "outra-pessoa", conversationId: "outro", conversationTitle: "Outro" });
  const add = async (key: string, text: string, where = space, kind: "text" | "audio" = "text") =>
    (ids[key] = (await insertMessageWithChunk(db.pool, { spaceId: where.spaceId, sourceId: where.sourceId, text, kind })).messageId);
  await add("temporal", "Recomendo o Temporal para orquestrar workflows de longa duração");
  await add("karpenter", "O Karpenter reduziu em 30% o custo do nosso cluster Kubernetes");
  await add("alloy", "O Grafana Alloy centraliza a coleta de telemetria");
  await add("audioT3", "precisamos reduzir o custo do cluster", { spaceId: space.spaceId, sourceId: t3SourceId }, "audio");
  await add("alheia", "Recomendo o Temporal para orquestrar workflows de longa duração", other);
  store = createPgEmbeddingRepository(db.pool);
  await store.ensureModel({ provider: "fake", model: embedder.model, baseUrl: "fake", dimensions: embedder.dimensions, queryPrefix: "", documentPrefix: "", minSimilarity: 0.5 });
  await createSweepEmbeddings({ store, embedderFor })();
  const index = createPgSearchIndex(db.pool, { typoMinSimilarity: 0.6 });
  search = createSearchEvidence({ index, lowConfidenceThreshold: 0.5, queryEmbedding: createActiveModelQueryEmbedding({ store, embedderFor }) });
  const down = createFakeEmbedder({ concepts: TEST_CONCEPTS, down: () => true });
  degradedSearch = createSearchEvidence({ index, lowConfidenceThreshold: 0.5, queryEmbedding: createActiveModelQueryEmbedding({ store, embedderFor: () => down }) });
});

afterAll(async () => {
  await db?.stop();
});

const cited = async (query: string, extra: { kind?: "audio"; sourceIds?: string[] } = {}, run = () => search) =>
  (await run()({ spaceId: space.spaceId, query, ...extra })).results.map((e) => e.messageId);

describe("busca combinada", () => {
  it("RF-02: paráfrase acha a mensagem sem nenhuma palavra em comum", async () => {
    expect(await cited("quem sugeriu algo para coordenar processos demorados?")).toContain(ids.temporal);
  });

  it("RF-04: erro de digitação acha a mensagem", async () => {
    expect(await cited("o que disseram do karpentr?")).toContain(ids.karpenter);
    expect(await cited("e o kubernets?")).toContain(ids.karpenter);
  });

  it("RN-03: a palavra exata continua acertando, com a mensagem entre as citadas", async () => {
    expect((await cited("quem falou do Grafana Alloy?"))[0]).toBe(ids.alloy);
  });

  it("RN-04: assunto ausente dá não encontrei", async () => {
    const response = await search({ spaceId: space.spaceId, query: "alguém usou um sistema de mensageria distribuída?" });
    expect(response.lowConfidence).toBe(true);
  });

  it("RN-02: o outro espaço nunca aparece, nem por sentido", async () => {
    expect(await cited("coordenar processos demorados")).not.toContain(ids.alheia);
  });

  it("filtros de tipo e de fonte valem também para o sentido", async () => {
    expect(await cited("cortar gastos da nuvem", { kind: "audio", sourceIds: [t3SourceId] })).toEqual([ids.audioT3]);
  });

  it("fonte em exclusão some também da busca por sentido", async () => {
    await db.pool.query("UPDATE sources SET status = 'deleting' WHERE id = $1", [t3SourceId]);
    expect(await cited("cortar gastos da nuvem", { kind: "audio" })).toEqual([]);
    await db.pool.query("UPDATE sources SET status = 'authorized' WHERE id = $1", [t3SourceId]);
  });

  it("RF-03: a mesma pergunta dá a mesma ordem", async () => {
    const a = await cited("custo do cluster");
    expect(await cited("custo do cluster")).toEqual(a);
  });

  it("D-09: sem o cálculo de sentido, responde por palavra e marca degradado", async () => {
    const response = await degradedSearch({ spaceId: space.spaceId, query: "quem falou do Grafana Alloy?" });
    expect(response.degraded).toBe(true);
    expect(response.results[0]?.messageId).toBe(ids.alloy);
    expect((await degradedSearch({ spaceId: space.spaceId, query: "coordenar processos demorados" })).lowConfidence).toBe(true);
  });
});
