// Armazenamento de mídia no SeaweedFS (ou qualquer S3) com cifra na aplicação (feature 005, D-04 a D-06).
// Único lugar que importa @aws-sdk/* (regra object-store-isolated).
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import type { ObjectStore } from "../../application/ports.js";
import { open, seal } from "./envelope.js";

export interface S3ObjectStoreOptions {
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKey: string;
  readonly secretKey: string;
  /** Chave AES-256 (32 bytes) dos objetos. */
  readonly key: Buffer;
}

export interface S3ObjectStore extends ObjectStore {
  /** Bytes como estão gravados (cifrados), para conferência (`media:conferir`) e testes. */
  getRaw(key: string): Promise<Uint8Array>;
}

export function createS3ObjectStore(options: S3ObjectStoreOptions): S3ObjectStore {
  const client = new S3Client({
    endpoint: options.endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: options.accessKey, secretAccessKey: options.secretKey },
    // O SeaweedFS não implementa os checksums novos do SDK; só quando o S3 exige.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const Bucket = options.bucket;

  async function exists(key: string): Promise<boolean> {
    try {
      await client.send(new HeadObjectCommand({ Bucket, Key: key }));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async function getRaw(key: string): Promise<Uint8Array> {
    const out = await client.send(new GetObjectCommand({ Bucket, Key: key }));
    if (!out.Body) throw new Error("objeto de mídia vazio");
    return out.Body.transformToByteArray();
  }

  return {
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
      } catch (error) {
        if (!isNotFound(error)) throw error;
        await client.send(new CreateBucketCommand({ Bucket }));
      }
    },
    async putIfAbsent(key, bytes) {
      if (await exists(key)) return { created: false };
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: seal(bytes, options.key), ContentType: "application/octet-stream" }));
      return { created: true };
    },
    async get(key) {
      return new Uint8Array(open(await getRaw(key), options.key));
    },
    exists,
    getRaw,
  };
}

function isNotFound(error: unknown): boolean {
  if (!(error instanceof S3ServiceException)) return false;
  return error.$metadata.httpStatusCode === 404 || error.name === "NotFound" || error.name === "NoSuchKey" || error.name === "NoSuchBucket";
}
