// T007 (feature 005, RF-04, D-04 a D-06): armazenamento de mídia contra o SeaweedFS real.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createS3ObjectStore, type S3ObjectStore } from "../../src/modules/media/index.js";
import { startTestObjectStorage, type TestObjectStorage } from "../support/object-storage.js";

let s3: TestObjectStorage;
let store: S3ObjectStore;
const key = Buffer.alloc(32, 8);

beforeAll(async () => {
  s3 = await startTestObjectStorage();
  store = createS3ObjectStore({ endpoint: s3.endpoint, bucket: s3.bucket, accessKey: s3.accessKey, secretKey: s3.secretKey, key });
  await store.ensureBucket();
  await store.ensureBucket(); // idempotente
}, 180_000);

afterAll(async () => {
  await s3?.stop();
});

describe("armazenamento de mídia (SeaweedFS)", () => {
  it("grava cifrado, lê em claro, e o mesmo conteúdo não é regravado", async () => {
    const bytes = new TextEncoder().encode("conteúdo de áudio sintético");
    expect(await store.putIfAbsent("space/source/abc", bytes)).toEqual({ created: true });
    expect(await store.putIfAbsent("space/source/abc", bytes)).toEqual({ created: false });
    expect(await store.exists("space/source/abc")).toBe(true);
    expect(await store.exists("space/source/nada")).toBe(false);
    expect(Buffer.from(await store.get("space/source/abc")).toString()).toBe("conteúdo de áudio sintético");
    expect(Buffer.from(await store.getRaw("space/source/abc")).includes(Buffer.from("sintético"))).toBe(false);
  });

  it("chave de mídia errada não decifra", async () => {
    const other = createS3ObjectStore({ endpoint: s3.endpoint, bucket: s3.bucket, accessKey: s3.accessKey, secretKey: s3.secretKey, key: Buffer.alloc(32, 9) });
    await store.putIfAbsent("space/source/k2", new Uint8Array([1, 2, 3]));
    await expect(other.get("space/source/k2")).rejects.toThrow(/adulterado ou chave errada/);
  });

  it("bucket privado: sem credencial, a listagem e a leitura são recusadas", async () => {
    await store.putIfAbsent("space/source/k3", new Uint8Array([4, 5, 6]));
    const list = await fetch(`${s3.endpoint}/${s3.bucket}/`);
    const read = await fetch(`${s3.endpoint}/${s3.bucket}/space/source/k3`);
    expect(list.status).toBe(403);
    expect(read.status).toBe(403);
  });
});
