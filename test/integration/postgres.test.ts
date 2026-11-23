// T027: integração com PostgreSQL real (migrações do projeto) e fila pg-boss.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOperator } from "../../src/main/seed-data.js";
import { createPgIdentityRepository, createResolveUserByChannelAccount } from "../../src/modules/identity/index.js";
import { INDEX_QUEUE, createIngestMessage, createPgUnitOfWork } from "../../src/modules/ingestion/index.js";
import { createIndexMessage, createPgChunkRepository } from "../../src/modules/knowledge/index.js";
import { createPgSearchIndex, createSearchEvidence } from "../../src/modules/retrieval/index.js";
import { createIsSourceAuthorized, createPgSourceRepository } from "../../src/modules/sources/index.js";
import { createJobQueue, type JobQueue } from "../../src/platform/queue/index.js";
import { newId } from "../../src/shared/index.js";
import { canonicalMessage } from "../support/messages.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";

let db: TestDatabase;
let queue: JobQueue;

beforeAll(async () => {
  db = await startTestDatabase();
  queue = createJobQueue(db.url, [{ name: INDEX_QUEUE, retryLimit: 5, retryDelaySeconds: 2, expireInSeconds: 60, deadLetter: `${INDEX_QUEUE}.dead` }]);
  await queue.start();
});

afterAll(async () => {
  await queue?.stop();
  await db?.stop();
});

function ingestor() {
  const isAuthorized = createIsSourceAuthorized(createPgSourceRepository(db.pool));
  return createIngestMessage({ sources: { check: isAuthorized }, unitOfWork: createPgUnitOfWork(db.pool, queue), ids: newId });
}

function msg(conversationId: string, externalMessageId: string, text: string, accountId = "fake-operator") {
  return canonicalMessage({
    source: { provider: "fake", accountId, conversationId, externalMessageId },
    text,
  });
}

const indexer = () => createIndexMessage(createPgChunkRepository(db.pool));
const searcher = () => createSearchEvidence({ index: createPgSearchIndex(db.pool), lowConfidenceThreshold: 0.5 });

describe("ingestão com PostgreSQL e pg-boss", () => {
  it("grava uma vez e enfileira a indexação; reentregas viram duplicata", async () => {
    await seedOperator(db.pool);
    const ingest = ingestor();
    const before = await queue.pendingCount(INDEX_QUEUE);
    const first = await ingest(msg("fake-group-1", "dup-1", "mensagem repetida"));
    const second = await ingest(msg("fake-group-1", "dup-1", "mensagem repetida"));
    const third = await ingest(msg("fake-group-1", "dup-1", "mensagem repetida"));
    expect(first.outcome).toBe("accepted");
    expect(second).toEqual({ outcome: "duplicate", messageId: (first as { messageId: string }).messageId });
    expect(third.outcome).toBe("duplicate");
    const { rows } = await db.pool.query("SELECT count(*)::int AS n FROM messages WHERE external_message_id = 'dup-1'");
    expect(rows[0].n).toBe(1);
    expect(await queue.pendingCount(INDEX_QUEUE)).toBe(before + 1);
  });

  it("rejeita fonte não autorizada sem gravar nada", async () => {
    await seedOperator(db.pool, { conversationId: "grupo-fechado", conversationTitle: "Fechado", sourceStatus: "not_authorized" });
    const outcome = await ingestor()(msg("grupo-fechado", "x-1", "não deveria entrar"));
    expect(outcome).toEqual({ outcome: "rejected", reason: "not_authorized" });
    const { rows } = await db.pool.query("SELECT count(*)::int AS n FROM messages WHERE external_message_id = 'x-1'");
    expect(rows[0].n).toBe(0);
  });

  it("não deixa job órfão quando a transação falha", async () => {
    await seedOperator(db.pool);
    const before = await queue.pendingCount(INDEX_QUEUE);
    const broken = createIngestMessage({
      sources: { check: createIsSourceAuthorized(createPgSourceRepository(db.pool)) },
      unitOfWork: {
        run: (work) =>
          createPgUnitOfWork(db.pool, queue).run(async (tx) => {
            await work(tx);
            throw new Error("falha depois de enfileirar");
          }),
      },
      ids: newId,
    });
    await expect(broken(msg("fake-group-1", "rollback-1", "vai desfazer"))).rejects.toThrow("falha depois de enfileirar");
    const { rows } = await db.pool.query("SELECT count(*)::int AS n FROM messages WHERE external_message_id = 'rollback-1'");
    expect(rows[0].n).toBe(0);
    expect(await queue.pendingCount(INDEX_QUEUE)).toBe(before);
  });
});

describe("regras do banco", () => {
  it("mensagem é imutável (trigger)", async () => {
    await seedOperator(db.pool);
    const outcome = await ingestor()(msg("fake-group-1", "imut-1", "texto original"));
    const id = (outcome as { messageId: string }).messageId;
    await expect(db.pool.query("UPDATE messages SET text = 'alterado' WHERE id = $1", [id])).rejects.toThrow(/imutáveis/);
  });

  it("excluir a fonte apaga mensagens, participantes, proveniência e trechos", async () => {
    const seed = await seedOperator(db.pool, { conversationId: "grupo-temporario", conversationTitle: "Temporário" });
    const outcome = await ingestor()(msg("grupo-temporario", "tmp-1", "conteúdo temporário"));
    const id = (outcome as { messageId: string }).messageId;
    await indexer()({ messageId: id, spaceId: seed.spaceId });
    await db.pool.query("DELETE FROM sources WHERE id = $1", [seed.sourceId]);
    const counts = await db.pool.query(
      `SELECT (SELECT count(*) FROM messages WHERE id = $1)::int AS m,
              (SELECT count(*) FROM message_chunks WHERE message_id = $1)::int AS c,
              (SELECT count(*) FROM message_provenance WHERE message_id = $1)::int AS p,
              (SELECT count(*) FROM participants WHERE source_id = $2)::int AS pa`,
      [id, seed.sourceId],
    );
    expect(counts.rows[0]).toEqual({ m: 0, c: 0, p: 0, pa: 0 });
  });
});

describe("indexação e busca", () => {
  it("encontra palavra com ou sem acento e reindexar não duplica", async () => {
    const seed = await seedOperator(db.pool);
    const outcome = await ingestor()(msg("fake-group-1", "busca-1", "A migração para observabilidade com OpenTelemetry reduziu custos"));
    const id = (outcome as { messageId: string }).messageId;
    expect(await indexer()({ messageId: id, spaceId: seed.spaceId })).toBe("indexed");
    expect(await indexer()({ messageId: id, spaceId: seed.spaceId })).toBe("indexed");
    const { rows } = await db.pool.query("SELECT count(*)::int AS n FROM message_chunks WHERE message_id = $1", [id]);
    expect(rows[0].n).toBe(1);
    const semAcento = await searcher()({ spaceId: seed.spaceId, query: "migracao opentelemetry" });
    expect(semAcento.results.map((r) => r.messageId)).toContain(id);
    expect(semAcento.lowConfidence).toBe(false);
    expect(semAcento.results[0]).toMatchObject({ author: "Ana", sourceTitle: "Grupo de teste", kind: "text" });
  });

  it("ignora palavras de pergunta: 'quem falou de X' não traz mensagens só com 'falou'", async () => {
    const seed = await seedOperator(db.pool);
    const outcome = await ingestor()(msg("fake-group-1", "fal-1", "Ontem o diretor falou na reunião de planejamento"));
    await indexer()({ messageId: (outcome as { messageId: string }).messageId, spaceId: seed.spaceId });
    expect(await searcher()({ spaceId: seed.spaceId, query: "quem falou de Temporal?" })).toEqual({ results: [], lowConfidence: true });
  });

  it("encontra a mensagem a partir de uma pergunta natural", async () => {
    const seed = await seedOperator(db.pool);
    const outcome = await ingestor()(msg("fake-group-1", "alloy-1", "O Grafana Alloy centraliza a coleta de telemetria"));
    const id = (outcome as { messageId: string }).messageId;
    await indexer()({ messageId: id, spaceId: seed.spaceId });
    const found = await searcher()({ spaceId: seed.spaceId, query: "quem falou do Grafana Alloy?" });
    expect(found.lowConfidence).toBe(false);
    expect(found.results[0]).toMatchObject({ messageId: id, score: 1 });
  });

  it("sinaliza baixa confiança quando nada casa", async () => {
    const seed = await seedOperator(db.pool);
    const result = await searcher()({ spaceId: seed.spaceId, query: "kubernetes temporal" });
    expect(result).toEqual({ results: [], lowConfidence: true });
  });

  it("isola espaços: conteúdo idêntico de outro usuário nunca aparece", async () => {
    const mine = await seedOperator(db.pool);
    const other = await seedOperator(db.pool, { provider: "fake", accountId: "outro-usuario", conversationId: "grupo-do-outro", displayName: "Outro" });
    const ingest = ingestor();
    const a = await ingest(msg("fake-group-1", "iso-1", "Grafana Alloy centraliza telemetria"));
    const b = await ingest(msg("grupo-do-outro", "iso-2", "Grafana Alloy centraliza telemetria", "outro-usuario"));
    const idA = (a as { messageId: string }).messageId;
    const idB = (b as { messageId: string }).messageId;
    await indexer()({ messageId: idA, spaceId: mine.spaceId });
    await indexer()({ messageId: idB, spaceId: other.spaceId });
    const found = await searcher()({ spaceId: mine.spaceId, query: "grafana alloy" });
    const ids = found.results.map((r) => r.messageId);
    expect(ids).toContain(idA);
    expect(ids).not.toContain(idB);
  });
});

describe("identidade", () => {
  it("resolve usuário e espaço pessoal da conta ativa e ignora conta desconhecida", async () => {
    const seed = await seedOperator(db.pool);
    const resolve = createResolveUserByChannelAccount(createPgIdentityRepository(db.pool));
    expect(await resolve("fake", "fake-operator")).toEqual({ userId: seed.userId, spaceId: seed.spaceId });
    expect(await resolve("fake", "ninguem")).toBeNull();
  });

  it("seed é idempotente", async () => {
    const a = await seedOperator(db.pool);
    const b = await seedOperator(db.pool);
    expect(b).toEqual(a);
  });
});
