// T005: leitura segura do arquivo exportado (RF-01, RF-10; RNF de streaming e segurança).
import { mkdtempSync, writeFileSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { ZipFile } from "yazl";
import { describe, expect, it } from "vitest";
import { ExportFileError, readExportLines } from "../../../src/channels/whatsapp-export/zip.js";

const dir = mkdtempSync(join(tmpdir(), "palantir-zip-"));
const CHAT = "10/11/2026 10:00 - Ana: oi\n10/11/2026 10:01 - Bia: olá\n";

async function makeZip(name: string, entries: { path: string; content: string | Buffer; compress?: boolean }[]) {
  const zip = new ZipFile();
  for (const e of entries) zip.addBuffer(Buffer.from(e.content), e.path, { compress: e.compress ?? true });
  zip.end();
  const file = join(dir, name);
  const out = createWriteStream(file);
  zip.outputStream.pipe(out);
  await once(out, "close");
  return file;
}

async function lines(file: string, options?: Parameters<typeof readExportLines>[1]) {
  const out: string[] = [];
  for await (const line of readExportLines(file, options)) out.push(line);
  return out;
}

describe("readExportLines", () => {
  it("lê o .txt de dentro do ZIP", async () => {
    const file = await makeZip("ok.zip", [
      { path: "Conversa do WhatsApp com Comunidade.txt", content: CHAT },
      { path: "PTT-20261110-WA0001.opus", content: "audio" },
    ]);
    expect(await lines(file)).toEqual(["10/11/2026 10:00 - Ana: oi", "10/11/2026 10:01 - Bia: olá"]);
  });

  it("lê um .txt solto", async () => {
    const file = join(dir, "solto.txt");
    writeFileSync(file, CHAT);
    expect((await lines(file)).slice(0, 2)).toEqual(["10/11/2026 10:00 - Ana: oi", "10/11/2026 10:01 - Bia: olá"]);
  });

  it("recusa arquivo inexistente", async () => {
    await expect(lines(join(dir, "nao-existe.zip"))).rejects.toMatchObject({ code: "not_found" });
  });

  it("recusa ZIP sem .txt", async () => {
    const file = await makeZip("sem-txt.zip", [{ path: "foto.jpg", content: "x" }]);
    await expect(lines(file)).rejects.toMatchObject({ code: "no_chat_file" });
  });

  it("recusa caminho fora da pasta (path traversal)", async () => {
    const file = await makeZip("traversal.zip", [{ path: "ok.txt", content: CHAT }]);
    // yazl não deixa gravar "..", então o nome é adulterado nos bytes do arquivo
    const { readFileSync } = await import("node:fs");
    const bytes = readFileSync(file);
    const evil = Buffer.from(bytes.toString("latin1").split("ok.txt").join("../x.t"), "latin1");
    const evilFile = join(dir, "evil.zip");
    writeFileSync(evilFile, evil);
    await expect(lines(evilFile)).rejects.toBeInstanceOf(ExportFileError);
    await expect(lines(evilFile)).rejects.toMatchObject({ code: "unsafe" });
  });

  it("recusa compressão acima de 100:1 (zip bomb)", async () => {
    const file = await makeZip("bomb.zip", [{ path: "chat.txt", content: Buffer.alloc(2_000_000, 0x61) }]);
    await expect(lines(file)).rejects.toMatchObject({ code: "unsafe" });
  });

  it("recusa conteúdo acima do limite de tamanho", async () => {
    const file = await makeZip("grande.zip", [{ path: "chat.txt", content: CHAT, compress: false }]);
    await expect(lines(file, { maxBytes: 10 })).rejects.toMatchObject({ code: "unsafe" });
  });
});
