// T001 (feature 007): migração 0009 com PostgreSQL real (data-delta.md).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOperator } from "../../src/main/seed-data.js";
import { insertMessageWithChunk } from "../support/chunks.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";
import { one } from "../support/rows.js";

let db: TestDatabase;
let spaceId: string;
let sourceId: string;

beforeAll(async () => {
  db = await startTestDatabase();
  ({ spaceId, sourceId } = await seedOperator(db.pool));
});

afterAll(async () => {
  await db?.stop();
});

async function model(name: string, status: string, dimensions = 3): Promise<string> {
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO embedding_models (provider, model, base_url, dimensions, min_similarity, status)
     VALUES ('fake', $1, 'fake', $2, 0.5, $3) RETURNING id`,
    [name, dimensions, status],
  );
  return one(rows).id;
}

describe("0009_semantic_search", () => {
  it("D-06: um só modelo ativo e uma só troca em construção", async () => {
    await model("a", "active");
    await expect(model("b", "active")).rejects.toThrow(/embedding_models_one_active/);
    await model("c", "building");
    await expect(model("d", "building")).rejects.toThrow(/embedding_models_one_building/);
    await model("e", "retired");
    await model("f", "retired");
  });

  it("D-04: a dimensão vai de 1 a 2.000 (limite do HNSW)", async () => {
    await expect(model("zero", "retired", 0)).rejects.toThrow(/check/i);
    await expect(model("grande", "retired", 2001)).rejects.toThrow(/check/i);
  });

  it("RN-08: apagar o trecho, a mensagem ou a fonte leva os vetores em cascata", async () => {
    const modelId = await model("cascata", "retired");
    const a = await insertMessageWithChunk(db.pool, { spaceId, sourceId, text: "primeira" });
    const b = await insertMessageWithChunk(db.pool, { spaceId, sourceId, text: "segunda" });
    for (const chunk of [a.chunkId, b.chunkId]) {
      await db.pool.query("INSERT INTO chunk_embeddings (chunk_id, model_id, space_id, embedding) VALUES ($1, $2, $3, '[1,0,0]')", [chunk, modelId, spaceId]);
    }
    await db.pool.query("DELETE FROM message_chunks WHERE id = $1", [a.chunkId]);
    await db.pool.query("DELETE FROM messages WHERE id = $1", [b.messageId]);
    const left = await db.pool.query("SELECT 1 FROM chunk_embeddings WHERE model_id = $1", [modelId]);
    expect(left.rowCount).toBe(0);
  });

  it("RF-04: text_norm fica sem acento e em minúsculas, com índice de trigramas", async () => {
    const { chunkId } = await insertMessageWithChunk(db.pool, { spaceId, sourceId, text: "Redução de CUSTO no Kubernetes" });
    const row = one((await db.pool.query<{ text_norm: string }>("SELECT text_norm FROM message_chunks WHERE id = $1", [chunkId])).rows);
    expect(row.text_norm).toBe("reducao de custo no kubernetes");
    const index = await db.pool.query("SELECT 1 FROM pg_indexes WHERE indexname = 'message_chunks_trgm'");
    expect(index.rowCount).toBe(1);
    const similar = one((await db.pool.query<{ ok: boolean }>("SELECT 'kubernets' <% $1 AS ok", [row.text_norm])).rows);
    expect(similar.ok).toBe(true);
  });
});
