// T005 (feature 005): caminho de mídia com PostgreSQL e SeaweedFS reais e o motor falso.
// Áudio sintético preparado → guardado cifrado → ingerido com job media.process → transcrito → indexado → achado.
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CanonicalMessage, MediaContent } from "../../src/contracts/channel/knowledge-channel.js";
import { seedOperator } from "../../src/main/seed-data.js";
import { createPgIdentityRepository, createResolveUserByChannelAccount } from "../../src/modules/identity/index.js";
import { INDEX_QUEUE, createIngestMessage, createPgUnitOfWork } from "../../src/modules/ingestion/index.js";
import { createIndexMessage, createPgChunkRepository } from "../../src/modules/knowledge/index.js";
import {
  MEDIA_QUEUE,
  createAudioProcessor,
  createFakeTranscriber,
  createPgMediaUnitOfWork,
  createPrepareAttachments,
  createProcessAttachment,
  createS3ObjectStore,
  sweepPendingMedia,
  type S3ObjectStore,
  type ProcessAttachment,
} from "../../src/modules/media/index.js";
import { createPgSearchIndex } from "../../src/modules/retrieval/index.js";
import {
  createEnsureImportSource,
  createIsSourceAuthorized,
  createPgImportSourceRepository,
  createPgSourceRepository,
} from "../../src/modules/sources/index.js";
import { createJobQueue, type JobQueue } from "../../src/platform/queue/index.js";
import { newId } from "../../src/shared/index.js";
import { saying, syntheticOpus } from "../support/audio.js";
import { canonicalMessage, withoutText } from "../support/messages.js";
import { startTestObjectStorage, type TestObjectStorage } from "../support/object-storage.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";
import { one } from "../support/rows.js";

let db: TestDatabase;
let s3: TestObjectStorage;
let queue: JobQueue;
let store: S3ObjectStore;
let runProcess: ProcessAttachment;
let accountId: string;
let conversationId: string;
let sourceId: string;
let spaceId: string;
let seq = 0;

const MEDIA_KEY = Buffer.alloc(32, 5);
const sources = () => ({ check: createIsSourceAuthorized(createPgSourceRepository(db.pool)) });

beforeAll(async () => {
  [db, s3] = await Promise.all([startTestDatabase(), startTestObjectStorage()]);
  queue = createJobQueue(db.url, [
    { name: INDEX_QUEUE, retryLimit: 5, retryDelaySeconds: 2, expireInSeconds: 60 },
    { name: MEDIA_QUEUE, retryLimit: 3, retryDelaySeconds: 1, expireInSeconds: 600 },
  ]);
  await queue.start();
  await seedOperator(db.pool);
  const operator = await createResolveUserByChannelAccount(createPgIdentityRepository(db.pool))("fake", "fake-operator");
  if (!operator) throw new Error("seed sem operador");
  spaceId = operator.spaceId;
  ({ accountId, conversationId, sourceId } = await createEnsureImportSource(createPgImportSourceRepository(db.pool))(operator, "Áudios"));
  store = createS3ObjectStore({ endpoint: s3.endpoint, bucket: s3.bucket, accessKey: s3.accessKey, secretKey: s3.secretKey, key: MEDIA_KEY });
  await store.ensureBucket();
  runProcess = createProcessAttachment({
    unitOfWork: createPgMediaUnitOfWork(db.pool, queue, { indexQueue: INDEX_QUEUE }),
    store,
    processors: [createAudioProcessor(createFakeTranscriber())],
  });
}, 240_000);

afterAll(async () => {
  await queue?.stop();
  await Promise.all([db?.stop(), s3?.stop()]);
});

beforeEach(async () => {
  await db.pool.query("DELETE FROM messages WHERE source_id = $1", [sourceId]);
  await db.pool.query("DELETE FROM pgboss.job WHERE name = $1", [MEDIA_QUEUE]);
});

const ingest = () =>
  createIngestMessage({
    sources: sources(),
    unitOfWork: createPgUnitOfWork(db.pool, queue, { mediaQueue: MEDIA_QUEUE, processable: (kind) => kind === "audio" }),
    ids: newId,
  });

const prepare = () => createPrepareAttachments({ sources: sources(), store, storeKinds: ["audio"], sleep: async () => undefined });

const BASE = Date.parse("2026-11-23T14:00:00Z");
const at = (s: number) => new Date(BASE + s * 1000).toISOString();

function liveAudio(offset: number): CanonicalMessage {
  seq += 1;
  return withoutText(
    canonicalMessage({
      id: newId(),
      contractVersion: "1.3.0",
      source: { provider: "whatsapp", accountId, conversationId, externalMessageId: `LIVE-A-${seq}` },
      timestamp: at(offset),
      kind: "audio",
      attachments: [{ id: `LIVE-A-${seq}:0`, mimeType: "audio/ogg; codecs=opus", fetchRef: `ref-${seq}` }],
      provenance: { captureMethod: "live", capturedAt: at(offset + 1), adapter: "whatsapp" },
    }),
  );
}

function importedAudio(offset: number, name: string): CanonicalMessage {
  const minute = Math.floor((BASE + offset * 1000) / 60_000) * 60_000;
  return withoutText(
    canonicalMessage({
      id: newId(),
      contractVersion: "1.3.0",
      source: { provider: "whatsapp", accountId, conversationId, importKey: createHash("sha256").update(name).digest("hex") },
      timestamp: new Date(minute).toISOString(),
      kind: "audio",
      attachments: [{ id: name, mimeType: "audio/ogg", fetchRef: name }],
      provenance: { captureMethod: "export_import", capturedAt: at(3600), adapter: "whatsapp-export" },
    }),
  );
}

const fetchOf = (bytes: Uint8Array) => async (): Promise<MediaContent> => ({ bytes, mimeType: "audio/ogg" });

async function attachmentOf(messageId: string) {
  const { rows } = await db.pool.query<{ id: string; storage_status: string; storage_key: string | null; sha256: string | null; duration_s: string; processing_status: string; processing_error: string | null }>(
    "SELECT id, storage_status, storage_key, sha256, duration_s, processing_status, processing_error FROM attachments WHERE message_id = $1",
    [messageId],
  );
  return one(rows);
}

async function ingestAudio(message: CanonicalMessage, bytes: Uint8Array) {
  const prepared = await prepare()(message, fetchOf(bytes));
  return ingest()(prepared);
}

const mediaJobs = async () => one((await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM pgboss.job WHERE name = $1", [MEDIA_QUEUE])).rows).n;

describe("caminho de mídia (feature 005)", () => {
  it("RF-04 e RF-06: áudio preparado vira 1 objeto cifrado e 1 job media.process na mesma transação", async () => {
    const bytes = syntheticOpus(saying("vamos migrar para o Kubernetes", 12));
    const outcome = await ingestAudio(liveAudio(0), bytes);
    expect(outcome.outcome).toBe("accepted");
    if (outcome.outcome !== "accepted") return;

    const attachment = await attachmentOf(outcome.messageId);
    const sha = createHash("sha256").update(bytes).digest("hex");
    expect(attachment).toMatchObject({ storage_status: "stored", sha256: sha, processing_status: "pending" });
    expect(attachment.storage_key).toBe(`${spaceId}/${sourceId}/${sha}`);
    expect(Number(attachment.duration_s)).toBeCloseTo(12, 1);
    expect(await mediaJobs()).toBe(1);

    const key = attachment.storage_key ?? "";
    const raw = await store.getRaw(key);
    expect(Buffer.from(raw).includes(Buffer.from("Kubernetes"))).toBe(false);
    expect(Buffer.from(await store.get(key)).equals(Buffer.from(bytes))).toBe(true);
  });

  it("RF-07 e RF-08: processar grava a transcrição ativa e os segmentos; a indexação acha a palavra com a faixa do áudio", async () => {
    const script = [
      { start: 0, end: 4.5, text: "bom dia pessoal" },
      { start: 4.5, end: 11, text: "hoje vou falar do Temporal para orquestrar fluxos" },
    ];
    const outcome = await ingestAudio(liveAudio(10), syntheticOpus({ seconds: 11, script }));
    if (outcome.outcome !== "accepted") throw new Error(outcome.outcome);
    const attachment = await attachmentOf(outcome.messageId);

    expect(await runProcess({ attachmentId: attachment.id, spaceId }, { lastAttempt: true })).toBe("done");
    const { rows } = await db.pool.query<{ n: number; active: number }>(
      `SELECT (SELECT count(*) FROM transcript_segments s JOIN transcripts t ON t.id = s.transcript_id WHERE t.attachment_id = $1)::int AS n,
              (SELECT count(*) FROM transcripts WHERE attachment_id = $1 AND is_active)::int AS active`,
      [attachment.id],
    );
    expect(rows[0]).toEqual({ n: 2, active: 1 });
    expect((await attachmentOf(outcome.messageId)).processing_status).toBe("done");

    await createIndexMessage(createPgChunkRepository(db.pool))({ messageId: outcome.messageId, spaceId });
    const found = await createPgSearchIndex(db.pool).search(spaceId, "quem falou do Temporal?", 5);
    expect(found[0]).toMatchObject({ messageId: outcome.messageId, kind: "audio", audioStartS: 0, audioEndS: 11, durationSeconds: 11 });
  });

  it("RF-04 e RF-05: o mesmo áudio pela captura e pela importação dá 1 objeto e 1 mensagem reconciliada", async () => {
    const bytes = syntheticOpus({ ...saying("orçamento do trimestre", 8), salt: "mesmo" });
    const first = await ingestAudio(liveAudio(20), bytes);
    const second = await ingestAudio(importedAudio(20, "PTT-20261123-WA0001.opus"), bytes);
    expect(first.outcome).toBe("accepted");
    expect(second).toEqual({ outcome: "reconciled", messageId: first.outcome === "accepted" ? first.messageId : "" });
    const { rows } = await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM attachments WHERE source_id = $1", [sourceId]);
    expect(one(rows).n).toBe(1);
    expect(await mediaJobs()).toBe(1);
  });

  it("áudio diferente no mesmo minuto não reconcilia", async () => {
    await ingestAudio(liveAudio(30), syntheticOpus({ ...saying("um", 3), salt: "a" }));
    const other = await ingestAudio(importedAudio(30, "PTT-20261123-WA0002.opus"), syntheticOpus({ ...saying("um", 3), salt: "b" }));
    expect(other.outcome).toBe("accepted");
  });

  it("RN-06: 90 min fica too_long; Ogg inválido fica failed/corrupted; nenhum dos dois tenta de novo", async () => {
    const long = await ingestAudio(liveAudio(40), syntheticOpus({ seconds: 90 * 60, script: [] }));
    if (long.outcome !== "accepted") throw new Error(long.outcome);
    const longAttachment = await attachmentOf(long.messageId);
    expect(await runProcess({ attachmentId: longAttachment.id, spaceId }, { lastAttempt: false })).toBe("too_long");

    const corrupt = new Uint8Array(4000).fill(7);
    const bad = await ingest()(
      await createPrepareAttachments({ sources: sources(), store, storeKinds: ["audio"], sleep: async () => undefined })(liveAudio(50), fetchOf(corrupt)),
    );
    if (bad.outcome !== "accepted") throw new Error(bad.outcome);
    const badAttachment = await attachmentOf(bad.messageId);
    expect(await runProcess({ attachmentId: badAttachment.id, spaceId }, { lastAttempt: false })).toBe("failed");
    expect(await attachmentOf(bad.messageId)).toMatchObject({ processing_status: "failed", processing_error: "corrupted" });
    expect(await attachmentOf(long.messageId)).toMatchObject({ processing_status: "too_long" });
  });

  it("áudio sem fala fica empty e não gera trecho", async () => {
    const outcome = await ingestAudio(liveAudio(60), syntheticOpus({ seconds: 5, script: [] }));
    if (outcome.outcome !== "accepted") throw new Error(outcome.outcome);
    const attachment = await attachmentOf(outcome.messageId);
    expect(await runProcess({ attachmentId: attachment.id, spaceId }, { lastAttempt: true })).toBe("empty");
    const { rows } = await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM message_chunks WHERE message_id = $1", [outcome.messageId]);
    expect(one(rows).n).toBe(0);
  });

  it("job repetido não cria outra transcrição", async () => {
    const outcome = await ingestAudio(liveAudio(70), syntheticOpus(saying("repetido", 4)));
    if (outcome.outcome !== "accepted") throw new Error(outcome.outcome);
    const attachment = await attachmentOf(outcome.messageId);
    await runProcess({ attachmentId: attachment.id, spaceId }, { lastAttempt: true });
    expect(await runProcess({ attachmentId: attachment.id, spaceId }, { lastAttempt: true })).toBe("skipped");
    const { rows } = await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM transcripts WHERE attachment_id = $1", [attachment.id]);
    expect(one(rows).n).toBe(1);
  });

  it("varredura republica anexo pendente que ficou sem job (transcrição desligada, job expirado)", async () => {
    const outcome = await ingestAudio(liveAudio(80), syntheticOpus({ ...saying("órfão", 3), salt: "sweep" }));
    if (outcome.outcome !== "accepted") throw new Error(outcome.outcome);
    await db.pool.query("DELETE FROM pgboss.job WHERE name = $1", [MEDIA_QUEUE]);
    const options = { mediaQueue: MEDIA_QUEUE, kinds: ["audio" as const], livePriority: 10, expireSeconds: () => 600 };
    expect(await sweepPendingMedia(db.pool, queue, options)).toBe(1);
    expect(await mediaJobs()).toBe(1);
    expect(await sweepPendingMedia(db.pool, queue, options)).toBe(0);
  });

  it("RN-07: job ao vivo publicado depois de 5 importados é entregue antes deles", async () => {
    for (let i = 0; i < 5; i += 1) await ingestAudio(importedAudio(100 + i * 120, `PTT-20261123-WA01${i}.opus`), syntheticOpus({ ...saying(`imp ${i}`, 2), salt: `i${i}` }));
    const live = await ingestAudio(liveAudio(900), syntheticOpus({ ...saying("ao vivo", 2), salt: "live" }));
    if (live.outcome !== "accepted") throw new Error(live.outcome);
    const liveAttachment = await attachmentOf(live.messageId);

    const order: string[] = [];
    await queue.work<{ attachmentId: string }>(MEDIA_QUEUE, async (data) => {
      order.push(data.attachmentId);
    }, { concurrency: 1 });
    await expect.poll(() => order.length, { timeout: 20_000 }).toBe(6);
    expect(order[0]).toBe(liveAttachment.id);
  });
});
