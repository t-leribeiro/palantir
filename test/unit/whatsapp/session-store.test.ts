// T010: sessão do chip num arquivo AES-256-GCM, fora do banco (RF-02 da S2, D-05).
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionFileError, createEncryptedFileStore } from "../../../src/channels/whatsapp/session/encrypted-file-store.js";

const SECRET = JSON.stringify({ creds: { noiseKey: "segredo-da-sessao-123" }, keys: { "pre-key": { 1: "abc" } } });
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "palantir-wa-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const store = (key = Buffer.alloc(32, 1), debounceMs = 0) => createEncryptedFileStore({ dir: join(dir, "sessao"), key, debounceMs });

describe("createEncryptedFileStore", () => {
  it("sem arquivo, não há sessão", async () => {
    expect(await store().load()).toBeNull();
  });

  it("grava e lê de volta, e o arquivo não tem o conteúdo em texto puro", async () => {
    const s = store();
    s.save(SECRET);
    await s.flush();
    expect(await store().load()).toBe(SECRET);
    const raw = await readFile(join(dir, "sessao", "agent-session.enc"));
    expect(raw.includes(Buffer.from("segredo-da-sessao-123"))).toBe(false);
    expect(raw[0]).toBe(1);
  });

  it("agrupa gravações próximas e guarda só a última", async () => {
    const s = store(Buffer.alloc(32, 1), 50);
    s.save("um");
    s.save("dois");
    s.save("tres");
    await s.flush();
    expect(await store().load()).toBe("tres");
  });

  it("com outra chave, recusa abrir com erro claro e sem mostrar conteúdo", async () => {
    const s = store();
    s.save(SECRET);
    await s.flush();
    const other = store(randomBytes(32));
    await expect(other.load()).rejects.toBeInstanceOf(SessionFileError);
    await expect(other.load()).rejects.toThrow(/pareie de novo/);
    await expect(other.load()).rejects.not.toThrow(/segredo/);
  });

  it("arquivo truncado ou adulterado é recusado (tag de autenticação com tamanho fixo)", async () => {
    const s = store();
    s.save(SECRET);
    await s.flush();
    const file = join(dir, "sessao", "agent-session.enc");
    const raw = await readFile(file);
    await writeFile(file, raw.subarray(0, 20));
    await expect(store().load()).rejects.toBeInstanceOf(SessionFileError);
    const tampered = Buffer.from(raw);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0xff;
    await writeFile(file, tampered);
    await expect(store().load()).rejects.toBeInstanceOf(SessionFileError);
  });

  it("arquivo temporário de uma escrita interrompida não corrompe a sessão", async () => {
    const s = store();
    s.save(SECRET);
    await s.flush();
    await writeFile(join(dir, "sessao", "agent-session.enc.tmp"), "pela metade");
    expect(await store().load()).toBe(SECRET);
  });

  it("remove apaga a sessão (logout)", async () => {
    const s = store();
    s.save(SECRET);
    await s.flush();
    await s.remove();
    expect(await store().load()).toBeNull();
    expect(await readdir(join(dir, "sessao"))).toEqual([]);
  });

  it("recusa chave que não tem 32 bytes", () => {
    expect(() => store(Buffer.alloc(16))).toThrow(/32 bytes/);
  });
});
