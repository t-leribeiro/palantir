// T014 (feature 005, RF-01, RF-02, RN-08, D-17): importação de áudios do export, com ZIP sintético.
import { createWriteStream, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ZipFile } from "yazl";
import { importWhatsAppExport, type ImportDeps, type PrepareMedia } from "../../../src/channels/whatsapp-export/index.js";
import { parseExport } from "../../../src/channels/whatsapp-export/parse.js";
import type { CanonicalMessage } from "../../../src/contracts/channel/knowledge-channel.js";
import { exportMedia } from "../../../src/main/media.js";
import { saying, syntheticOpus } from "../../support/audio.js";

const dir = mkdtempSync(join(tmpdir(), "palantir-audio-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const CHAT = [
  "12/11/2026 10:00 - Ana: bom dia",
  "12/11/2026 10:01 - Ana: PTT-20261112-WA0001.opus (arquivo anexado)",
  "12/11/2026 10:02 - Bruno: PTT-20261112-WA0002.opus (arquivo anexado)",
  "12/11/2026 10:03 - Bruno: IMG-20261112-WA0003.jpg (arquivo anexado)",
  "12/11/2026 10:04 - Ana: AUD-20261112-WA0004.m4a (arquivo anexado)",
  "orçamento do trimestre",
  "12/11/2026 10:05 - Bruno: <Mídia oculta>",
].join("\n");

const audio1 = syntheticOpus(saying("Temporal para orquestrar", 12));

async function zipWith(files: Record<string, Uint8Array | string>): Promise<string> {
  const path = join(dir, `export-${Object.keys(files).length}-${Math.random().toString(36).slice(2)}.zip`);
  const zip = new ZipFile();
  for (const [name, content] of Object.entries(files)) zip.addBuffer(Buffer.from(content), name);
  zip.end();
  await new Promise<void>((resolve, reject) => {
    zip.outputStream.pipe(createWriteStream(path)).on("close", () => resolve()).on("error", reject);
  });
  return path;
}

function deps(prepare?: PrepareMedia) {
  const stored = new Map<string, CanonicalMessage>();
  const fetched: string[] = [];
  const d: ImportDeps = {
    ensureSource: async (title) => ({ provider: "whatsapp", accountId: "unlinked:u1", conversationId: "export:t3", title }),
    async ingest(message) {
      const key = message.source.importKey ?? "";
      if (stored.has(key)) return { outcome: "duplicate", messageId: "existing" };
      stored.set(key, message);
      return { outcome: "accepted", messageId: message.id };
    },
    ...exportMedia,
    ...(prepare ? { prepare } : {}),
  };
  return { d, stored, fetched };
}

/** Preparação falsa: "guarda" o que o fetch devolve, como o módulo media faria. */
function fakePrepare(fetched: string[]): PrepareMedia {
  return async (message, fetch) => {
    const attachments = [];
    for (const a of message.attachments) {
      if (a.status !== undefined || !a.fetchRef) {
        attachments.push(a);
        continue;
      }
      const content = await fetch(a.fetchRef);
      fetched.push(`${a.fetchRef}:${content.bytes.length}:${content.mimeType}`);
      attachments.push({ id: a.id, mimeType: a.mimeType, status: "stored" as const, storageKey: `k/${a.id}`, sha256: "a".repeat(64) });
    }
    return { ...message, attachments };
  };
}

describe("parser: anexos do export (D-17)", () => {
  it("guarda o nome do arquivo (Android e iOS), marca a legenda e deixa <Mídia oculta> sem nome", () => {
    const ios = "[12/11/2026, 10:06:00] Ana: ‎<anexado: 00000012-AUDIO-2026-11-12-10-06-00.opus>";
    // O formato fica travado pelo primeiro cabeçalho: a linha iOS é lida num export iOS à parte.
    const parsed = parseExport(CHAT.split("\n"));
    expect(parsed.attachments.map((a) => [a.author, a.fileName, a.captioned])).toEqual([
      ["Ana", "PTT-20261112-WA0001.opus", false],
      ["Bruno", "PTT-20261112-WA0002.opus", false],
      ["Bruno", "IMG-20261112-WA0003.jpg", false],
      ["Ana", "AUD-20261112-WA0004.m4a", true],
      ["Bruno", undefined, false],
    ]);
    const onlyIos = parseExport([ios]);
    expect(onlyIos.attachments[0]?.fileName).toBe("00000012-AUDIO-2026-11-12-10-06-00.opus");
  });
});

describe("importação de áudios", () => {
  it("RF-01 e RF-02: áudio presente vira mensagem audio guardada; ausente vira indisponível; o relatório conta", async () => {
    const file = await zipWith({ "Conversa do WhatsApp com T3.txt": CHAT, "PTT-20261112-WA0001.opus": audio1, "IMG-20261112-WA0003.jpg": "jpg" });
    const fetched: string[] = [];
    const { d, stored } = deps(fakePrepare(fetched));
    const report = await importWhatsAppExport(file, { conversation: "T3" }, d);
    expect(report).toMatchObject({
      imported: 4, // 2 textos (bom dia + legenda) + 2 áudios
      audiosLinked: 1,
      audiosMissing: 1,
      audiosCaptioned: 1,
      audiosQueued: 1,
      otherMedia: 2, // a imagem e a <Mídia oculta>
      mediaFound: 5,
    });
    expect(fetched).toEqual([`PTT-20261112-WA0001.opus:${audio1.length}:audio/ogg; codecs=opus`]);
    const audios = [...stored.values()].filter((m) => m.kind === "audio");
    expect(audios.map((m) => [m.sender.displayName, m.attachments[0]?.status, m.attachments[0]?.unavailableReason, m.text])).toEqual([
      ["Ana", "stored", undefined, undefined],
      ["Bruno", "unavailable", "missing_in_export", undefined],
    ]);
    expect(audios[0]).toMatchObject({ timestamp: "2026-11-12T13:01:00.000Z", provenance: { captureMethod: "export_import", adapter: "whatsapp-export" } });
    expect(audios[0]?.source.importKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("RN-08: reimportar dá as mesmas chaves; nada novo entra", async () => {
    const file = await zipWith({ "chat.txt": CHAT, "PTT-20261112-WA0001.opus": audio1 });
    const fetched: string[] = [];
    const { d } = deps(fakePrepare(fetched));
    await importWhatsAppExport(file, { conversation: "T3" }, d);
    const again = await importWhatsAppExport(file, { conversation: "T3" }, d);
    expect(again).toMatchObject({ imported: 0, existing: 4, audiosLinked: 1, audiosQueued: 0 });
  });

  it("sem preparação (mídia desligada), os áudios só contam como outras mídias, como até a S3", async () => {
    const file = await zipWith({ "chat.txt": CHAT, "PTT-20261112-WA0001.opus": audio1 });
    const { d, stored } = deps();
    const report = await importWhatsAppExport(file, { conversation: "T3" }, d);
    expect(report).toMatchObject({ imported: 2, audiosLinked: 0, audiosMissing: 0, audiosCaptioned: 0, audiosQueued: 0, otherMedia: 5 });
    expect([...stored.values()].every((m) => m.kind === "text")).toBe(true);
  });

  it(".txt solto: todo áudio citado fica indisponível, sem tentar ler arquivo", async () => {
    const txt = join(dir, "solto.txt");
    writeFileSync(txt, CHAT);
    const fetched: string[] = [];
    const { d } = deps(fakePrepare(fetched));
    const report = await importWhatsAppExport(txt, { conversation: "T3" }, d);
    expect(report).toMatchObject({ audiosLinked: 0, audiosMissing: 2 });
    expect(fetched).toEqual([]);
  });
});
