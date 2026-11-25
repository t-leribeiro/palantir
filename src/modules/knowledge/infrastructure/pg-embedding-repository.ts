// Registro de modelos e vetores no PostgreSQL (feature 007, D-04, D-06; data-delta.md §2). O índice HNSW de cada
// modelo é parcial e com cast para a dimensão dele; nome e dimensão vêm de valores validados, nunca de texto livre.
import { withTransaction, type Pool, type Queryable } from "../../../platform/db/index.js";
import type { ChunkText, ChunkVector, EmbeddingStore, EnsureOutcome, ModelStatus, RegisteredModel } from "../application/embedding-store.js";

interface ModelRow {
  id: string;
  provider: string;
  model: string;
  base_url: string;
  dimensions: number;
  query_prefix: string;
  document_prefix: string;
  min_similarity: number;
  status: ModelStatus;
}

const MODEL_COLUMNS = "id, provider, model, base_url, dimensions, query_prefix, document_prefix, min_similarity, status";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const toModel = (r: ModelRow): RegisteredModel => ({
  id: r.id,
  provider: r.provider,
  model: r.model,
  baseUrl: r.base_url,
  dimensions: r.dimensions,
  queryPrefix: r.query_prefix,
  documentPrefix: r.document_prefix,
  minSimilarity: Number(r.min_similarity),
  status: r.status,
});

/** Nome do índice parcial do modelo e o cast da dimensão, para a busca repetir exatamente a mesma expressão. */
export function vectorIndexOf(model: { readonly id: string; readonly dimensions: number }): { readonly name: string; readonly cast: string } {
  if (!UUID.test(model.id) || !Number.isInteger(model.dimensions) || model.dimensions < 1 || model.dimensions > 2000) {
    throw new RangeError("modelo inválido para índice");
  }
  return { name: `chunk_embeddings_hnsw_${model.id.replace(/-/g, "").slice(0, 8)}`, cast: `vector(${model.dimensions})` };
}

async function createVectorIndex(db: Queryable, model: { readonly id: string; readonly dimensions: number }): Promise<void> {
  const { name, cast } = vectorIndexOf(model);
  await db.query(
    `CREATE INDEX IF NOT EXISTS ${name} ON chunk_embeddings USING hnsw ((embedding::${cast}) vector_cosine_ops) WHERE model_id = '${model.id}'`,
  );
}

const vectorLiteral = (v: readonly number[]) => `[${v.join(",")}]`;

export function createPgEmbeddingRepository(pool: Pool): EmbeddingStore {
  const byStatus = async (status: ModelStatus) =>
    (await pool.query<ModelRow>(`SELECT ${MODEL_COLUMNS} FROM embedding_models WHERE status = $1`, [status])).rows.map(toModel);

  return {
    async ensureModel(spec) {
      return withTransaction(pool, async (db) => {
        await db.query("LOCK TABLE embedding_models IN SHARE ROW EXCLUSIVE MODE");
        const found = await db.query<ModelRow>(
          `SELECT ${MODEL_COLUMNS} FROM embedding_models
            WHERE provider = $1 AND model = $2 AND base_url = $3 AND dimensions = $4 AND query_prefix = $5 AND document_prefix = $6`,
          [spec.provider, spec.model, spec.baseUrl, spec.dimensions, spec.queryPrefix, spec.documentPrefix],
        );
        const existing = found.rows[0];
        if (existing && existing.status !== "retired") {
          await db.query("UPDATE embedding_models SET min_similarity = $2 WHERE id = $1", [existing.id, spec.minSimilarity]);
          return { model: { ...toModel(existing), minSimilarity: spec.minSimilarity }, outcome: "unchanged" as EnsureOutcome };
        }
        const hasActive = ((await db.query("SELECT 1 FROM embedding_models WHERE status = 'active'")).rowCount ?? 0) > 0;
        const status: ModelStatus = hasActive ? "building" : "active";
        // Uma troca por vez: a configuração nova substitui uma troca que não terminou.
        if (status === "building") await db.query("UPDATE embedding_models SET status = 'retired', retired_at = now() WHERE status = 'building'");
        const row = existing
          ? (await db.query<ModelRow>(
              `UPDATE embedding_models SET status = $2, min_similarity = $3, retired_at = NULL,
                      activated_at = CASE WHEN $2 = 'active' THEN now() END
                WHERE id = $1 RETURNING ${MODEL_COLUMNS}`,
              [existing.id, status, spec.minSimilarity],
            )).rows[0]
          : (await db.query<ModelRow>(
              `INSERT INTO embedding_models (provider, model, base_url, dimensions, query_prefix, document_prefix, min_similarity, status, activated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 = 'active' THEN now() END) RETURNING ${MODEL_COLUMNS}`,
              [spec.provider, spec.model, spec.baseUrl, spec.dimensions, spec.queryPrefix, spec.documentPrefix, spec.minSimilarity, status],
            )).rows[0];
        if (!row) throw new Error("o banco não devolveu o modelo registrado");
        if (status === "active") await createVectorIndex(db, row);
        return { model: toModel(row), outcome: status as EnsureOutcome };
      });
    },
    async targets() {
      return [...(await byStatus("active")), ...(await byStatus("building"))];
    },
    async activeModel() {
      return (await byStatus("active"))[0] ?? null;
    },
    async chunksOfMessage(messageId) {
      const { rows } = await pool.query<{ id: string; space_id: string; text: string }>(
        "SELECT id, space_id, text FROM message_chunks WHERE message_id = $1 ORDER BY idx",
        [messageId],
      );
      return rows.map((r): ChunkText => ({ chunkId: r.id, spaceId: r.space_id, text: r.text }));
    },
    async pendingChunks(modelId, limit) {
      const { rows } = await pool.query<{ id: string; space_id: string; text: string }>(
        `SELECT c.id, c.space_id, c.text
           FROM message_chunks c
           JOIN messages m ON m.id = c.message_id
           JOIN sources s ON s.id = m.source_id AND s.status <> 'deleting'
          WHERE NOT EXISTS (SELECT 1 FROM chunk_embeddings e WHERE e.chunk_id = c.id AND e.model_id = $1)
          ORDER BY m.sent_at DESC, c.id
          LIMIT $2`,
        [modelId, limit],
      );
      return rows.map((r): ChunkText => ({ chunkId: r.id, spaceId: r.space_id, text: r.text }));
    },
    async pendingCount(modelId) {
      const { rows } = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM message_chunks c
           JOIN messages m ON m.id = c.message_id
           JOIN sources s ON s.id = m.source_id AND s.status <> 'deleting'
          WHERE NOT EXISTS (SELECT 1 FROM chunk_embeddings e WHERE e.chunk_id = c.id AND e.model_id = $1)`,
        [modelId],
      );
      return rows[0]?.n ?? 0;
    },
    async save(modelId, vectors: readonly ChunkVector[]) {
      if (vectors.length === 0) return;
      const values: unknown[] = [modelId];
      const tuples = vectors.map((v, i) => {
        values.push(v.chunkId, v.spaceId, vectorLiteral(v.vector));
        const at = 2 + i * 3;
        return `($${at}::uuid, $1::uuid, $${at + 1}::uuid, $${at + 2}::vector)`;
      });
      // O trecho pode ter sido reindexado ou apagado entre o cálculo e a gravação: só grava os que existem.
      await pool.query(
        `INSERT INTO chunk_embeddings (chunk_id, model_id, space_id, embedding)
         SELECT v.chunk_id, v.model_id, v.space_id, v.embedding
           FROM (VALUES ${tuples.join(", ")}) AS v (chunk_id, model_id, space_id, embedding)
           JOIN message_chunks c ON c.id = v.chunk_id
         ON CONFLICT (chunk_id, model_id) DO NOTHING`,
        values,
      );
    },
    async activate(modelId) {
      await withTransaction(pool, async (db) => {
        const target = (await db.query<ModelRow>(`SELECT ${MODEL_COLUMNS} FROM embedding_models WHERE id = $1 FOR UPDATE`, [modelId])).rows[0];
        if (!target || target.status !== "building") return;
        await db.query("UPDATE embedding_models SET status = 'retired', retired_at = now() WHERE status = 'active'");
        await db.query("UPDATE embedding_models SET status = 'active', activated_at = now() WHERE id = $1", [modelId]);
        await createVectorIndex(db, target);
      });
    },
    async purgeRetired(limit) {
      const deleted = await pool.query(
        `DELETE FROM chunk_embeddings e USING (
           SELECT e2.chunk_id, e2.model_id FROM chunk_embeddings e2
             JOIN embedding_models m ON m.id = e2.model_id AND m.status = 'retired'
            LIMIT $1) AS old
          WHERE e.chunk_id = old.chunk_id AND e.model_id = old.model_id`,
        [limit],
      );
      const empty = await pool.query<ModelRow>(
        `SELECT ${MODEL_COLUMNS} FROM embedding_models m
          WHERE m.status = 'retired' AND NOT EXISTS (SELECT 1 FROM chunk_embeddings e WHERE e.model_id = m.id)`,
      );
      for (const model of empty.rows) await pool.query(`DROP INDEX IF EXISTS ${vectorIndexOf(model).name}`);
      return deleted.rowCount ?? 0;
    },
  };
}
