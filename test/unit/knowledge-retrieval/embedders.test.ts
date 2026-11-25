// T008 e T009 (feature 007, D-01; interfaces/embedder-e-varredura.md §2 e §3): adaptadores do cálculo de sentido
// contra um fetch falso. Nenhum chega à rede.
import { describe, expect, it } from "vitest";
import { EmbedderError, createOpenAiCompatibleEmbedder, createVoyageEmbedder } from "../../../src/modules/knowledge/index.js";

interface Captured {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

function fakeFetch(reply: (body: Record<string, unknown>) => Response | Promise<Response>, captured: Captured[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    captured.push({ url: String(input), body, headers: (init?.headers ?? {}) as Record<string, string> });
    return reply(body);
  }) as typeof fetch;
}

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const dataFor = (input: unknown, vector: (i: number) => number[]) => ({
  data: (input as string[]).map((_, i) => ({ index: i, embedding: vector(i) })).reverse(),
});

describe("adaptador openai-compatible", () => {
  it("manda os textos com o prefixo do propósito, ordena por index e normaliza", async () => {
    const captured: Captured[] = [];
    const embedder = createOpenAiCompatibleEmbedder({
      url: "http://127.0.0.1:8091/",
      model: "intfloat/multilingual-e5-base",
      dimensions: 2,
      queryPrefix: "query: ",
      documentPrefix: "passage: ",
      fetch: fakeFetch((body) => json({ model: "intfloat/multilingual-e5-base", ...dataFor(body.input, (i) => [3 + i, 4]) }), captured),
    });
    const vectors = await embedder.embed(["a", "b"], "query");
    expect(captured[0]?.url).toBe("http://127.0.0.1:8091/v1/embeddings");
    expect(captured[0]?.body).toEqual({ model: "intfloat/multilingual-e5-base", input: ["query: a", "query: b"] });
    expect(vectors[0]).toEqual([0.6, 0.8]);
    expect(Math.hypot(...(vectors[1] ?? []))).toBeCloseTo(1, 9);
    await embedder.embed(["c"], "document");
    expect(captured[1]?.body.input).toEqual(["passage: c"]);
  });

  it("divide em lotes de 32 e manda a chave e a dimensão só quando configuradas", async () => {
    const captured: Captured[] = [];
    const embedder = createOpenAiCompatibleEmbedder({
      url: "https://api.openai.com",
      model: "text-embedding-3-large",
      dimensions: 2,
      requestDimensions: true,
      apiKey: "segredo",
      fetch: fakeFetch((body) => json(dataFor(body.input, () => [1, 0])), captured),
    });
    const vectors = await embedder.embed(Array.from({ length: 70 }, (_, i) => `t${i}`), "document");
    expect(vectors).toHaveLength(70);
    expect(captured.map((c) => (c.body.input as string[]).length)).toEqual([32, 32, 6]);
    expect(captured[0]?.body.dimensions).toBe(2);
    expect(captured[0]?.headers.authorization).toBe("Bearer segredo");
  });

  it("EC-05: dimensão errada, modelo trocado e respostas de erro viram EmbedderError com o motivo", async () => {
    const make = (reply: (body: Record<string, unknown>) => Response) =>
      createOpenAiCompatibleEmbedder({ url: "http://127.0.0.1:8091", model: "m", dimensions: 3, fetch: fakeFetch(reply) });
    const reason = async (reply: (body: Record<string, unknown>) => Response) => {
      try {
        await make(reply).embed(["x"], "document");
      } catch (error) {
        expect(error).toBeInstanceOf(EmbedderError);
        return (error as EmbedderError).reason;
      }
      return "ok";
    };
    expect(await reason((b) => json(dataFor(b.input, () => [1, 0])))).toBe("dimension_mismatch");
    expect(await reason((b) => json({ model: "outro", ...dataFor(b.input, () => [1, 0, 0]) }))).toBe("model_mismatch");
    expect(await reason(() => json({}, 429))).toBe("rate_limited");
    expect(await reason(() => json({}, 503))).toBe("unavailable");
    expect(await reason(() => json({}, 401))).toBe("rejected");
  });

  it("conexão recusada vira unavailable; prazo estourado vira timeout; health não lança", async () => {
    const refused = createOpenAiCompatibleEmbedder({
      url: "http://127.0.0.1:8091",
      model: "m",
      dimensions: 1,
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    await expect(refused.embed(["x"], "query")).rejects.toMatchObject({ reason: "unavailable" });
    expect(await refused.health()).toBe(false);
    const slow = createOpenAiCompatibleEmbedder({
      url: "http://127.0.0.1:8091",
      model: "m",
      dimensions: 1,
      timeoutMs: 20,
      fetch: ((_: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason as Error)))) as typeof fetch,
    });
    await expect(slow.embed(["x"], "query")).rejects.toMatchObject({ reason: "timeout" });
  });
});

describe("adaptador voyage", () => {
  it("usa input_type pelo propósito e output_dimension, sem prefixos", async () => {
    const captured: Captured[] = [];
    const embedder = createVoyageEmbedder({
      url: "https://ai.mongodb.com",
      model: "voyage-4",
      dimensions: 2,
      apiKey: "chave",
      fetch: fakeFetch((body) => json(dataFor(body.input, () => [0, 2])), captured),
    });
    expect(await embedder.embed(["pergunta"], "query")).toEqual([[0, 1]]);
    expect(captured[0]?.url).toBe("https://ai.mongodb.com/v1/embeddings");
    expect(captured[0]?.body).toEqual({ model: "voyage-4", input: ["pergunta"], input_type: "query", output_dimension: 2 });
    expect(captured[0]?.headers.authorization).toBe("Bearer chave");
  });

  it("sem chave, recusa antes de chamar", async () => {
    const captured: Captured[] = [];
    const embedder = createVoyageEmbedder({ url: "https://ai.mongodb.com", model: "voyage-4", dimensions: 2, apiKey: undefined, fetch: fakeFetch(() => json({}), captured) });
    await expect(embedder.embed(["x"], "document")).rejects.toMatchObject({ reason: "rejected" });
    expect(captured).toHaveLength(0);
    expect(await embedder.health()).toBe(false);
  });
});
