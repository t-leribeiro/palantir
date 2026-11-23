// Sessão do chip num único arquivo AES-256-GCM, fora do banco e do repositório (feature 003: RF-02, D-05).
// Genérico: guarda um texto. A serialização das credenciais do WhatsApp fica no provedor (regra whatsapp-lib-isolated).
// Formato: versão (1 byte) + nonce (12) + tag (16) + texto cifrado. Gravação atômica: arquivo temporário + rename.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const FORMAT_VERSION = 1;
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 1 + NONCE_BYTES + TAG_BYTES;
export const SESSION_FILE = "agent-session.enc";

export class SessionFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionFileError";
  }
}

export interface EncryptedFileStore {
  /** Texto guardado, ou `null` sem sessão. Lança `SessionFileError` se a chave não abrir o arquivo. */
  load(): Promise<string | null>;
  /** Agenda a gravação; gravações próximas são agrupadas e só a última vale. */
  save(text: string): void;
  /** Espera a gravação pendente terminar. */
  flush(): Promise<void>;
  /** Apaga a sessão (logout). */
  remove(): Promise<void>;
}

export interface EncryptedFileStoreOptions {
  readonly dir: string;
  readonly key: Buffer;
  readonly debounceMs?: number;
  readonly fileName?: string;
}

export function encrypt(key: Buffer, text: string): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_BYTES });
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([FORMAT_VERSION]), nonce, cipher.getAuthTag(), body]);
}

export function decrypt(key: Buffer, data: Buffer): string {
  try {
    // Tag com tamanho fixo: um arquivo com tag encurtada não pode passar na verificação (Semgrep gcm-no-tag-length).
    if (data[0] !== FORMAT_VERSION || data.length < HEADER_BYTES) throw new Error("formato");
    const nonce = data.subarray(1, 1 + NONCE_BYTES);
    const tag = data.subarray(1 + NONCE_BYTES, HEADER_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data.subarray(HEADER_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    throw new SessionFileError("Não foi possível abrir a sessão do WhatsApp (chave diferente ou arquivo corrompido): pareie de novo.");
  }
}

async function readIfExists(file: string): Promise<Buffer | null> {
  try {
    return await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function createEncryptedFileStore(options: EncryptedFileStoreOptions): EncryptedFileStore {
  if (options.key.length !== KEY_BYTES) throw new SessionFileError(`A chave da sessão precisa ter ${KEY_BYTES} bytes.`);
  const file = join(options.dir, options.fileName ?? SESSION_FILE);
  const debounceMs = options.debounceMs ?? 1000;
  let pending: string | undefined;
  let timer: NodeJS.Timeout | undefined;
  let writing: Promise<void> = Promise.resolve();

  async function writeNow(text: string): Promise<void> {
    await mkdir(options.dir, { recursive: true, mode: 0o700 });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, encrypt(options.key, text), { mode: 0o600 });
    await rename(tmp, file);
  }

  function startWrite(): void {
    timer = undefined;
    const text = pending;
    pending = undefined;
    if (text !== undefined) writing = writing.then(() => writeNow(text));
  }

  return {
    async load() {
      const data = await readIfExists(file);
      return data ? decrypt(options.key, data) : null;
    },
    save(text) {
      pending = text;
      if (!timer) timer = setTimeout(startWrite, debounceMs);
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        startWrite();
      }
      await writing;
    },
    async remove() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      pending = undefined;
      await writing.catch(() => undefined);
      await rm(file, { force: true });
      await rm(`${file}.tmp`, { force: true });
    },
  };
}
