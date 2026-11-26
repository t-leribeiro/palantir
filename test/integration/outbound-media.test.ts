// T012 (feature 008, D-08, interfaces/canal-anexo-de-audio.md §2): o arquivo do áudio só sai para a conta dona do
// espaço, decifrado só na memória e conferido pelo SHA-256. PostgreSQL e SeaweedFS reais.
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOperator } from "../../src/main/seed-data.js";
import { createLoadOutboundMedia, createPgOutboundMediaLookup, createS3ObjectStore, type S3ObjectStore } from "../../src/modules/media/index.js";
import { insertMessageWithChunk } from "../support/chunks.js";
import { startTestObjectStorage, type TestObjectStorage } from "../support/object-storage.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";
import { one } from "../support/rows.js";

let db: TestDatabase;
let s3: TestObjectStorage;
let store: S3ObjectStore;
const AUDIO = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 9, 8, 7, 6]);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function storedAudio(spaceId: string, sourceId: string, bytes: Uint8Array, recordedSha = sha256(bytes)): Promise<string> {
  const { messageId } = await insertMessageWithChunk(db.pool, { spaceId, sourceId, text: "", kind: "audio" });
  const key = `${spaceId}/${sourceId}/${sha256(bytes)}`;
  await store.putIfAbsent(key, bytes);
  return one(
    (
      await db.pool.query<{ id: string }>(
        `INSERT INTO attachments (message_id, space_id, source_id, media_kind, mime_type, sha256, storage_key, size_bytes, storage_status, processing_status)
         VALUES ($1, $2, $3, 'audio', 'audio/ogg; codecs=opus', $4, $5, $6, 'stored', 'done') RETURNING id`,
        [messageId, spaceId, sourceId, recordedSha, key, bytes.length],
      )
    ).rows,
  ).id;
}

beforeAll(async () => {
  [db, s3] = await Promise.all([startTestDatabase(), startTestObjectStorage()]);
  store = createS3ObjectStore({ endpoint: s3.endpoint, bucket: s3.bucket, accessKey: s3.accessKey, secretKey: s3.secretKey, key: Buffer.alloc(32, 4) });
  await store.ensureBucket();
}, 180_000);

afterAll(async () => {
  await Promise.all([db?.stop(), s3?.stop()]);
});

describe("arquivo do áudio para o dono", () => {
  it("entrega os bytes em claro à conta dona do espaço", async () => {
    const owner = await seedOperator(db.pool);
    const id = await storedAudio(owner.spaceId, owner.sourceId, AUDIO);
    const load = createLoadOutboundMedia({ provider: "fake", lookup: createPgOutboundMediaLookup(db.pool), store });
    const content = await load("fake-operator", id);
    expect(Buffer.from(content.bytes).equals(Buffer.from(AUDIO))).toBe(true);
    expect(content.mimeType).toBe("audio/ogg; codecs=opus");
  });

  it("outra conta, outro canal, id inexistente ou fora de uuid: expired, sem ler o armazenamento", async () => {
    const owner = await seedOperator(db.pool);
    const id = await storedAudio(owner.spaceId, owner.sourceId, new Uint8Array([1, 2, 3, 4]));
    await seedOperator(db.pool, { displayName: "Outra pessoa", accountId: "fake-stranger", conversationId: "fake-group-9" });
    const lookup = createPgOutboundMediaLookup(db.pool);
    const reads: string[] = [];
    const spy = { get: async (key: string) => (reads.push(key), store.get(key)) };
    const load = createLoadOutboundMedia({ provider: "fake", lookup, store: spy });
    await expect(load("fake-stranger", id)).rejects.toMatchObject({ reason: "expired" });
    await expect(createLoadOutboundMedia({ provider: "whatsapp", lookup, store: spy })("fake-operator", id)).rejects.toMatchObject({ reason: "expired" });
    await expect(load("fake-operator", "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ reason: "expired" });
    await expect(load("fake-operator", "space/source/chave")).rejects.toMatchObject({ reason: "expired" });
    expect(reads).toEqual([]);
  });

  it("conta revogada não recebe; hash diferente do registrado é recusado; armazenamento fora do ar é download_failed", async () => {
    const owner = await seedOperator(db.pool);
    const tampered = await storedAudio(owner.spaceId, owner.sourceId, new Uint8Array([5, 5, 5, 5]), "0".repeat(64));
    const lookup = createPgOutboundMediaLookup(db.pool);
    const load = createLoadOutboundMedia({ provider: "fake", lookup, store });
    await expect(load("fake-operator", tampered)).rejects.toMatchObject({ reason: "expired" });
    const ok = await storedAudio(owner.spaceId, owner.sourceId, new Uint8Array([6, 6, 6, 6]));
    const down = createLoadOutboundMedia({ provider: "fake", lookup, store: { get: async () => Promise.reject(new Error("ECONNREFUSED")) } });
    await expect(down("fake-operator", ok)).rejects.toMatchObject({ reason: "download_failed" });
    await db.pool.query("UPDATE channel_accounts SET status = 'revoked' WHERE external_account_id = 'fake-operator'");
    try {
      await expect(load("fake-operator", ok)).rejects.toMatchObject({ reason: "expired" });
    } finally {
      await db.pool.query("UPDATE channel_accounts SET status = 'active' WHERE external_account_id = 'fake-operator'");
    }
  });
});
