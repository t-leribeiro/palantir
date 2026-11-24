// T003 (feature 006): exclusão de fonte em duas etapas com PostgreSQL e SeaweedFS reais
// (D-07, D-08; interfaces/jobs-exclusao-e-aviso.md).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOperator } from "../../src/main/seed-data.js";
import { AGENT_NOTIFY_QUEUE } from "../../src/modules/agent/index.js";
import { createPgIdentityRepository, createResolveUserByChannelAccount } from "../../src/modules/identity/index.js";
import { createMediaPurger, createS3ObjectStore, type S3ObjectStore } from "../../src/modules/media/index.js";
import { createPgSearchIndex } from "../../src/modules/retrieval/index.js";
import {
  SOURCE_DELETE_QUEUE,
  createEnsureImportSource,
  createExecuteSourceDeletion,
  createIsSourceAuthorized,
  createPgDeletionStore,
  createPgImportSourceRepository,
  createPgSourceRepository,
  createRequestSourceDeletion,
  type DeletionStore,
  type ImportSourceRef,
  type MediaPurger,
} from "../../src/modules/sources/index.js";
import { createJobQueue, type JobQueue } from "../../src/platform/queue/index.js";
import { startTestObjectStorage, type TestObjectStorage } from "../support/object-storage.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";
import { one } from "../support/rows.js";

let db: TestDatabase;
let s3: TestObjectStorage;
let queue: JobQueue;
let store: S3ObjectStore;
let deletions: DeletionStore;
let owner: { userId: string; spaceId: string };
let seq = 0;

const SHA = (n: number) => String(n).padStart(64, "0");

beforeAll(async () => {
  [db, s3] = await Promise.all([startTestDatabase(), startTestObjectStorage()]);
  queue = createJobQueue(db.url, [
    { name: SOURCE_DELETE_QUEUE, retryLimit: 12, retryDelaySeconds: 30, expireInSeconds: 900 },
    { name: AGENT_NOTIFY_QUEUE, retryLimit: 5, retryDelaySeconds: 10, expireInSeconds: 120 },
  ]);
  await queue.start();
  await seedOperator(db.pool);
  const resolved = await createResolveUserByChannelAccount(createPgIdentityRepository(db.pool))("fake", "fake-operator");
  if (!resolved) throw new Error("seed sem operador");
  owner = resolved;
  store = createS3ObjectStore({ endpoint: s3.endpoint, bucket: s3.bucket, accessKey: s3.accessKey, secretKey: s3.secretKey, key: Buffer.alloc(32, 7) });
  await store.ensureBucket();
  deletions = createPgDeletionStore(db.pool, queue);
}, 240_000);

afterAll(async () => {
  await queue?.stop();
  await Promise.all([db?.stop(), s3?.stop()]);
});

const ensureSource = (title: string) => createEnsureImportSource(createPgImportSourceRepository(db.pool))(owner, title);

/** Fonte com 3 mensagens (uma de áudio, com anexo, transcrição e segmento), trechos e 2 objetos de mídia. */
async function populated(title: string): Promise<ImportSourceRef> {
  const source = await ensureSource(title);
  const participant = one(
    (await db.pool.query<{ id: string }>("INSERT INTO participants (source_id, external_id, display_name) VALUES ($1, 'ana', 'Ana') RETURNING id", [source.sourceId])).rows,
  ).id;
  const message = async (kind: string, text: string | null) => {
    seq += 1;
    const id = one(
      (
        await db.pool.query<{ id: string }>(
          `INSERT INTO messages (id, space_id, source_id, participant_id, kind, text, sent_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now()) RETURNING id`,
          [owner.spaceId, source.sourceId, participant, kind, text],
        )
      ).rows,
    ).id;
    await db.pool.query("INSERT INTO message_chunks (space_id, message_id, idx, text) VALUES ($1, $2, 0, $3)", [owner.spaceId, id, text ?? `girassol falado ${seq}`]);
    return id;
  };
  await message("text", "os girassóis do projeto");
  await message("text", "outra mensagem sobre girassóis");
  const audio = await message("audio", null);
  const key = (n: number) => `${owner.spaceId}/${source.sourceId}/${SHA(n)}`;
  const attachment = one(
    (
      await db.pool.query<{ id: string }>(
        `INSERT INTO attachments (message_id, space_id, source_id, media_kind, mime_type, sha256, storage_key, duration_s, storage_status, processing_status)
         VALUES ($1, $2, $3, 'audio', 'audio/ogg', $4, $5, 3, 'stored', 'done') RETURNING id`,
        [audio, owner.spaceId, source.sourceId, SHA(seq), key(seq)],
      )
    ).rows,
  ).id;
  const transcript = one(
    (
      await db.pool.query<{ id: string }>(
        `INSERT INTO transcripts (attachment_id, space_id, engine, model, model_version, language, text, empty, is_active)
         VALUES ($1, $2, 'fake', 'm', 'v1', 'pt', 'girassol falado', false, true) RETURNING id`,
        [attachment, owner.spaceId],
      )
    ).rows,
  ).id;
  await db.pool.query("INSERT INTO transcript_segments (transcript_id, idx, start_s, end_s, text) VALUES ($1, 0, 0, 3, 'girassol falado')", [transcript]);
  await store.putIfAbsent(key(seq), new Uint8Array([1, 2, 3]));
  await store.putIfAbsent(key(seq + 1000), new Uint8Array([4, 5, 6]));
  return source;
}

const count = async (sql: string, params: unknown[]) => one((await db.pool.query<{ n: number }>(sql, params)).rows).n;
const jobs = (name: string, key: string) => count("SELECT count(*)::int AS n FROM pgboss.job WHERE name = $1 AND singleton_key = $2", [name, key]);
const request = (sourceId: string) =>
  createRequestSourceDeletion(deletions)({
    spaceId: owner.spaceId,
    sourceId,
    requestedBy: owner.userId,
    channel: "fake",
    notify: { provider: "fake", accountId: "fake-operator" },
  });

describe("exclusão de fonte em duas etapas (feature 006)", () => {
  it("D-07: o pedido esconde a fonte na hora, recusa ingestão e importação e publica o job", async () => {
    const source = await populated("Projeto Girassol");
    const result = await request(source.sourceId);
    if (result.outcome !== "requested") throw new Error(result.outcome);
    expect(result.title).toBe("Projeto Girassol");

    expect(await createPgSearchIndex(db.pool).search(owner.spaceId, "girassóis", 10)).toEqual([]);
    const decision = await createIsSourceAuthorized(createPgSourceRepository(db.pool))({ provider: source.provider, accountId: source.accountId, conversationId: source.conversationId });
    expect(decision.status).toBe("source_deleting");
    await expect(ensureSource("Projeto Girassol")).rejects.toMatchObject({ code: "source_deleting" });
    expect(await jobs(SOURCE_DELETE_QUEUE, result.deletionId)).toBe(1);
    expect(await count("SELECT count(*)::int AS n FROM audit_events WHERE action = 'source.deletion_requested' AND target_id = $1", [source.sourceId])).toBe(1);
    expect(await request(source.sourceId)).toMatchObject({ outcome: "already_deleting", title: "Projeto Girassol" });
  });

  it("D-08: o job apaga linhas e objetos da fonte, grava as contagens, audita e publica o aviso uma vez", async () => {
    const other = await populated("Outro Projeto");
    const source = await populated("Projeto Apagável");
    const result = await request(source.sourceId);
    if (result.outcome !== "requested") throw new Error(result.outcome);
    const execute = createExecuteSourceDeletion({ store: deletions, purger: createMediaPurger(store) });

    expect(await execute({ deletionId: result.deletionId, sourceId: source.sourceId, spaceId: owner.spaceId })).toBe("completed");
    for (const table of ["messages", "participants", "attachments"]) {
      expect(await count(`SELECT count(*)::int AS n FROM ${table} WHERE source_id = $1`, [source.sourceId])).toBe(0);
    }
    expect(await count("SELECT count(*)::int AS n FROM sources WHERE id = $1", [source.sourceId])).toBe(0);
    expect(await count("SELECT count(*)::int AS n FROM transcripts t JOIN attachments a ON a.id = t.attachment_id WHERE a.source_id = $1", [source.sourceId])).toBe(0);
    expect(await store.exists(`${owner.spaceId}/${other.sourceId}/${SHA(seq - 3)}`)).toBe(true);
    const row = one(
      (await db.pool.query<{ messages_deleted: number; audios_deleted: number; objects_deleted: number; completed_at: Date | null }>(
        "SELECT messages_deleted, audios_deleted, objects_deleted, completed_at FROM source_deletions WHERE id = $1",
        [result.deletionId],
      )).rows,
    );
    expect(row).toMatchObject({ messages_deleted: 3, audios_deleted: 1, objects_deleted: 2 });
    expect(row.completed_at).not.toBeNull();
    const audit = one((await db.pool.query<{ details: Record<string, number> }>("SELECT details FROM audit_events WHERE action = 'source.deleted' AND target_id = $1", [source.sourceId])).rows);
    expect(audit.details).toEqual({ messages: 3, audios: 1, objects: 2 });
    expect(await jobs(AGENT_NOTIFY_QUEUE, result.deletionId)).toBe(1);

    // Reentrega do job: nada a fazer, nenhum aviso a mais.
    expect(await execute({ deletionId: result.deletionId, sourceId: source.sourceId, spaceId: owner.spaceId })).toBe("already_completed");
    expect(await jobs(AGENT_NOTIFY_QUEUE, result.deletionId)).toBe(1);
    // Fonte nova com o mesmo nome depois da exclusão.
    expect((await ensureSource("Projeto Apagável")).created).toBe(true);
  });

  it("EC-03: com o armazenamento fora do ar, falha e mantém a fonte em exclusão; a nova tentativa conclui", async () => {
    const source = await populated("Projeto Instável");
    const result = await request(source.sourceId);
    if (result.outcome !== "requested") throw new Error(result.outcome);
    let calls = 0;
    const real = createMediaPurger(store);
    const flaky: MediaPurger = {
      purgeSource: async (space, src) => {
        calls += 1;
        if (calls === 1) throw new Error("armazenamento fora do ar");
        return real.purgeSource(space, src);
      },
    };
    const execute = createExecuteSourceDeletion({ store: deletions, purger: flaky });
    const job = { deletionId: result.deletionId, sourceId: source.sourceId, spaceId: owner.spaceId };

    await expect(execute(job)).rejects.toThrow("armazenamento fora do ar");
    expect(await count("SELECT count(*)::int AS n FROM sources WHERE id = $1 AND status = 'deleting'", [source.sourceId])).toBe(1);
    const found = await createPgSearchIndex(db.pool).search(owner.spaceId, "girassóis", 10);
    expect(found.map((e) => e.sourceTitle)).not.toContain("Projeto Instável");
    expect(await execute(job)).toBe("completed");
    expect(await count("SELECT messages_deleted AS n FROM source_deletions WHERE id = $1", [result.deletionId])).toBe(3);
  });

  it("fonte inexistente ou de outro espaço não é apagada", async () => {
    expect(await createRequestSourceDeletion(deletions)({ spaceId: owner.spaceId, sourceId: "00000000-0000-0000-0000-000000000009", requestedBy: owner.userId, channel: "fake" })).toEqual({
      outcome: "not_found",
    });
  });
});
