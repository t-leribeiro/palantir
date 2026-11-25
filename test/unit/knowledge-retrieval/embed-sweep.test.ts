// T011 e T012 (feature 007, D-05, D-06): cálculo junto da indexação e varredura dos pendentes, com repositório em
// memória e o embedder falso.
import { describe, expect, it } from "vitest";
import {
  EmbedderError,
  createEmbedMessageChunks,
  createFakeEmbedder,
  createSweepEmbeddings,
  type ChunkText,
  type Embedder,
  type EmbeddingStore,
  type ModelSpec,
  type RegisteredModel,
} from "../../../src/modules/knowledge/index.js";

function memoryStore(models: RegisteredModel[], chunks: (ChunkText & { messageId: string })[]) {
  const vectors = new Map<string, Set<string>>();
  const has = (modelId: string, chunkId: string) => vectors.get(modelId)?.has(chunkId) ?? false;
  const store: EmbeddingStore = {
    async ensureModel(spec: ModelSpec) {
      return { model: { ...spec, id: "x", status: "active" }, outcome: "unchanged" };
    },
    async targets() {
      return models.filter((m) => m.status !== "retired");
    },
    async activeModel() {
      return models.find((m) => m.status === "active") ?? null;
    },
    async chunksOfMessage(messageId) {
      return chunks.filter((c) => c.messageId === messageId);
    },
    async pendingChunks(modelId, limit) {
      return chunks.filter((c) => !has(modelId, c.chunkId)).slice(0, limit);
    },
    async pendingCount(modelId) {
      return chunks.filter((c) => !has(modelId, c.chunkId)).length;
    },
    async save(modelId, rows) {
      const set = vectors.get(modelId) ?? new Set<string>();
      for (const r of rows) set.add(r.chunkId);
      vectors.set(modelId, set);
    },
    async activate(modelId) {
      for (const m of models) {
        if (m.status === "active") Object.assign(m, { status: "retired" });
        if (m.id === modelId) Object.assign(m, { status: "active" });
      }
    },
    async purgeRetired() {
      return 0;
    },
  };
  return { store, count: (modelId: string) => vectors.get(modelId)?.size ?? 0 };
}

const model = (id: string, status: RegisteredModel["status"]): RegisteredModel => ({
  id,
  status,
  provider: "fake",
  model: id,
  baseUrl: "fake",
  dimensions: 64,
  queryPrefix: "",
  documentPrefix: "",
  minSimilarity: 0.5,
});

const chunk = (n: number, messageId = `m${n}`) => ({ chunkId: `c${n}`, spaceId: "s", text: `texto ${n}`, messageId });

describe("cálculo junto da indexação", () => {
  it("grava os vetores dos trechos da mensagem para o ativo e o em construção", async () => {
    const models = [model("a", "active"), model("b", "building")];
    const { store, count } = memoryStore(models, [chunk(1, "m1"), chunk(2, "m1"), chunk(3, "m2")]);
    const embed = createEmbedMessageChunks({ store, embedderFor: () => createFakeEmbedder() });
    expect(await embed("m1")).toBe("embedded");
    expect(count("a")).toBe(2);
    expect(count("b")).toBe(2);
  });

  it("RN-07: com o motor fora do ar, adia sem lançar; sem modelo ou sem trecho, nada a fazer", async () => {
    const { store, count } = memoryStore([model("a", "active")], [chunk(1)]);
    const down = createFakeEmbedder({ down: () => true });
    const items: string[] = [];
    const observer = { items: (o: string) => void items.push(o), pending: () => undefined, activated: () => undefined };
    expect(await createEmbedMessageChunks({ store, embedderFor: () => down, observer })("m1")).toBe("deferred");
    expect(count("a")).toBe(0);
    expect(items).toEqual(["deferred"]);
    expect(await createEmbedMessageChunks({ store, embedderFor: () => down })("sem-trecho")).toBe("skipped");
    const empty = memoryStore([], [chunk(1)]);
    expect(await createEmbedMessageChunks({ store: empty.store, embedderFor: () => down })("m1")).toBe("skipped");
  });

  it("erro que não é do motor continua lançando", async () => {
    const { store } = memoryStore([model("a", "active")], [chunk(1)]);
    const broken: Embedder = { ...createFakeEmbedder(), embed: async () => Promise.reject(new Error("bug")) };
    await expect(createEmbedMessageChunks({ store, embedderFor: () => broken })("m1")).rejects.toThrow("bug");
  });
});

describe("varredura", () => {
  it("calcula em lotes até acabar, ativa o em construção completo e informa os pendentes", async () => {
    const models = [model("a", "active"), model("b", "building")];
    const { store, count } = memoryStore(models, Array.from({ length: 70 }, (_, i) => chunk(i)));
    let pending = -1;
    let activations = 0;
    const observer = { items: () => undefined, pending: (n: number) => void (pending = n), activated: () => void (activations += 1) };
    const sweep = createSweepEmbeddings({ store, embedderFor: () => createFakeEmbedder(), observer }, { batchSize: 32 });
    const result = await sweep();
    expect(result).toMatchObject({ embedded: 140, activated: true, pending: 0 });
    expect(count("b")).toBe(70);
    expect(models.map((m) => m.status)).toEqual(["retired", "active"]);
    expect(pending).toBe(0);
    expect(activations).toBe(1);
  });

  it("para no prazo e continua no próximo ciclo; com o motor fora do ar, não ativa nada", async () => {
    let clock = 0;
    const models = [model("a", "active")];
    const { store, count } = memoryStore(models, Array.from({ length: 10 }, (_, i) => chunk(i)));
    const ticking: Embedder = { ...createFakeEmbedder(), embed: async (t) => ((clock += 10), t.map(() => new Array<number>(64).fill(0.125))) };
    const sweep = createSweepEmbeddings({ store, embedderFor: () => ticking }, { batchSize: 2, budgetMs: 25, now: () => clock });
    expect((await sweep()).embedded).toBe(6);
    expect((await sweep()).pending).toBe(0);
    expect(count("a")).toBe(10);

    const swap = [model("a", "active"), model("b", "building")];
    const down = memoryStore(swap, [chunk(1)]);
    const result = await createSweepEmbeddings({ store: down.store, embedderFor: (m) => (m.id === "b" ? createFakeEmbedder({ down: () => true }) : createFakeEmbedder()) })();
    expect(result.activated).toBe(false);
    expect(swap.map((m) => m.status)).toEqual(["active", "building"]);
  });

  it("modelo sem adaptador na configuração atual fica como está", async () => {
    const { store, count } = memoryStore([model("a", "active")], [chunk(1)]);
    const result = await createSweepEmbeddings({ store, embedderFor: () => undefined })();
    expect(result).toMatchObject({ embedded: 0, pending: 1 });
    expect(count("a")).toBe(0);
    expect(EmbedderError).toBeDefined();
  });
});
