// T010 (feature 007, D-04, D-06): registro de modelos e vetores com PostgreSQL real.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedOperator } from "../../src/main/seed-data.js";
import { createPgEmbeddingRepository, vectorIndexOf, type EmbeddingStore, type ModelSpec } from "../../src/modules/knowledge/index.js";
import { insertMessageWithChunk } from "../support/chunks.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";

let db: TestDatabase;
let store: EmbeddingStore;
let spaceId: string;
let sourceId: string;

const spec = (model: string, dimensions = 3): ModelSpec => ({
  provider: "fake",
  model,
  baseUrl: "fake",
  dimensions,
  queryPrefix: "",
  documentPrefix: "",
  minSimilarity: 0.5,
});

beforeAll(async () => {
  db = await startTestDatabase();
  ({ spaceId, sourceId } = await seedOperator(db.pool));
  store = createPgEmbeddingRepository(db.pool);
});

beforeEach(async () => {
  await db.pool.query("DELETE FROM embedding_models");
  await db.pool.query("DELETE FROM messages");
});

afterAll(async () => {
  await db?.stop();
});

const indexes = async () =>
  (await db.pool.query<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE indexname LIKE 'chunk_embeddings_hnsw_%'")).rows.map((r) => r.indexname);

describe("registro de modelos", () => {
  it("primeiro modelo nasce ativo e com índice; o mesmo de novo fica como está e atualiza o limiar", async () => {
    const first = await store.ensureModel(spec("a"));
    expect(first.outcome).toBe("active");
    expect(await indexes()).toContain(vectorIndexOf(first.model).name);
    const again = await store.ensureModel({ ...spec("a"), minSimilarity: 0.61 });
    expect(again.outcome).toBe("unchanged");
    expect(again.model.id).toBe(first.model.id);
    expect((await store.activeModel())?.minSimilarity).toBeCloseTo(0.61, 5);
  });

  it("D-06: outro modelo nasce em construção; a ativação troca e aposenta o anterior; a limpeza remove vetores e índice", async () => {
    const a = (await store.ensureModel(spec("a"))).model;
    const b = await store.ensureModel(spec("b", 2));
    expect(b.outcome).toBe("building");
    expect((await store.targets()).map((m) => m.model)).toEqual(["a", "b"]);
    const { chunkId } = await insertMessageWithChunk(db.pool, { spaceId, sourceId, text: "custo do cluster" });
    await store.save(a.id, [{ chunkId, spaceId, vector: [1, 0, 0] }]);
    await store.activate(b.model.id);
    expect((await store.activeModel())?.model).toBe("b");
    expect(await indexes()).toContain(vectorIndexOf(b.model).name);
    expect(await store.purgeRetired(100)).toBe(1);
    expect(await indexes()).not.toContain(vectorIndexOf(a).name);
  });

  it("uma configuração nova substitui uma troca que não terminou", async () => {
    await store.ensureModel(spec("a"));
    await store.ensureModel(spec("b"));
    const c = await store.ensureModel(spec("c"));
    expect(c.outcome).toBe("building");
    expect((await store.targets()).map((m) => m.model)).toEqual(["a", "c"]);
  });
});

describe("vetores", () => {
  it("pendentes das mais recentes para as mais antigas; gravar é idempotente e ignora trecho que sumiu", async () => {
    const model = (await store.ensureModel(spec("a"))).model;
    const old = await insertMessageWithChunk(db.pool, { spaceId, sourceId, text: "antiga", sentAt: new Date("2026-01-01T10:00:00Z") });
    const recent = await insertMessageWithChunk(db.pool, { spaceId, sourceId, text: "recente", sentAt: new Date("2026-11-01T10:00:00Z") });
    expect((await store.pendingChunks(model.id, 10)).map((c) => c.text)).toEqual(["recente", "antiga"]);
    expect(await store.pendingCount(model.id)).toBe(2);
    await store.save(model.id, [{ chunkId: recent.chunkId, spaceId, vector: [1, 0, 0] }]);
    await store.save(model.id, [{ chunkId: recent.chunkId, spaceId, vector: [0, 1, 0] }]);
    await db.pool.query("DELETE FROM messages WHERE id = $1", [old.messageId]);
    await store.save(model.id, [{ chunkId: old.chunkId, spaceId, vector: [0, 0, 1] }]);
    const rows = await db.pool.query<{ embedding: string }>("SELECT embedding::text FROM chunk_embeddings WHERE model_id = $1", [model.id]);
    expect(rows.rows.map((r) => r.embedding)).toEqual(["[1,0,0]"]);
    expect(await store.pendingCount(model.id)).toBe(0);
  });

  it("trechos de fonte em exclusão não ficam pendentes", async () => {
    const model = (await store.ensureModel(spec("a"))).model;
    const other = await seedOperator(db.pool, { conversationId: "apagando", conversationTitle: "Apagando" });
    await insertMessageWithChunk(db.pool, { spaceId, sourceId: other.sourceId, text: "vai sumir" });
    await db.pool.query("UPDATE sources SET status = 'deleting' WHERE id = $1", [other.sourceId]);
    expect(await store.pendingCount(model.id)).toBe(0);
  });
});
