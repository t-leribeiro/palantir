// Teste local sobre exportações reais em `exports/` (fora do git: dados de terceiros, repositório público).
// Sem arquivos (CI, máquinas de outras pessoas), é pulado. As verificações só contam violações, para que uma
// falha nunca imprima conteúdo de mensagem.
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { importWhatsAppExport, readExportLines, type ImportDeps } from "../../../src/channels/whatsapp-export/index.js";
import type { CanonicalMessage } from "../../../src/contracts/channel/knowledge-channel.js";
import { exportMedia } from "../../../src/main/media.js";

const dir = fileURLToPath(new URL("../../../exports/", import.meta.url));
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(zip|txt)$/i.test(f)) : [];

const HEADER = /^[\u200e\u200f\ufeff]*\[?\d{1,2}\/\d{1,2}\/\d{2,4}/;
const MEDIA_HEADER = /(\((arquivo anexado|file attached)\)|<(m[íi]dia oculta|media omitted|anexado:[^>]*|attached:[^>]*)>)\s*$/i;

/** Legendas de anexo no arquivo bruto (linha logo após o cabeçalho do anexo) que não viraram mensagem (BUG-6). */
async function lostCaptions(file: string, stored: readonly CanonicalMessage[]): Promise<number> {
  const lines: string[] = [];
  for await (const line of readExportLines(`${dir}${file}`)) lines.push(line.replace(/\r$/, ""));
  const texts = stored.map((m) => m.text ?? "");
  let lost = 0;
  for (const [i, line] of lines.entries()) {
    const next = lines[i + 1]?.replace(/[\u200e\u200f]/g, "").trim();
    if (!MEDIA_HEADER.test(line) || !next || HEADER.test(next)) continue;
    if (!texts.some((t) => t.startsWith(next.replace(/\s*<(mensagem editada|this message was edited)>$/i, "")))) lost += 1;
  }
  return lost;
}

const APP_MARKERS = /(<Mensagem editada>|<This message was edited>)$|^(Mensagem apagada|Esta mensagem foi apagada|This message was deleted)$/;

async function importInMemory(file: string) {
  const stored: CanonicalMessage[] = [];
  const deps: ImportDeps = {
    async ensureSource(title) {
      return { provider: "whatsapp", accountId: "unlinked:local", conversationId: "export:local", title };
    },
    async ingest(message) {
      stored.push(message);
      return { outcome: "accepted", messageId: message.id };
    },
    // Feature 005: lê o arquivo de cada áudio do ZIP (só o tamanho importa aqui; nada é guardado nem mostrado).
    ...exportMedia,
    async prepare(message, fetch) {
      const attachments = [];
      for (const a of message.attachments) {
        if (a.status !== undefined || !a.fetchRef) attachments.push(a);
        else attachments.push({ id: a.id, mimeType: a.mimeType, status: "stored" as const, storageKey: "k", sha256: "0".repeat(64), sizeBytes: (await fetch(a.fetchRef)).bytes.length });
      }
      return { ...message, attachments };
    },
  };
  const report = await importWhatsAppExport(`${dir}${file}`, { conversation: "local" }, deps);
  return { report, stored };
}

describe.skipIf(files.length === 0)("exportações reais locais (exports/)", () => {
  it.each(files)("%s: importa sem rejeitar, sem mensagens falsas nem marcadores do app", async (file) => {
    const { report, stored } = await importInMemory(file);
    // A ordem vale dentro de cada tipo: os textos entram primeiro e os áudios depois (feature 005).
    const inOrder = (list: readonly CanonicalMessage[]) => list.filter((m, i) => i > 0 && m.timestamp < (list[i - 1]?.timestamp ?? "")).length;
    const outOfOrder = inOrder(stored.filter((m) => m.kind === "text")) + inOrder(stored.filter((m) => m.kind === "audio"));
    const markers = stored.filter((m) => APP_MARKERS.test(m.text ?? "")).length;
    const emptyTexts = stored.filter((m) => m.kind === "text" && (m.text ?? "").trim() === "").length;
    const emptyAudioFiles = stored.filter((m) => m.kind === "audio" && m.attachments[0]?.sizeBytes === 0).length;
    const tildeAuthors = stored.filter((m) => m.sender.displayName?.startsWith("~")).length;
    const captionsLost = await lostCaptions(file, stored);
    const audiosMissing = report.audiosMissing;
    expect({ rejected: report.rejected, unrecognized: report.unrecognizedLines, outOfOrder, markers, emptyTexts, tildeAuthors, captionsLost, audiosMissing, emptyAudioFiles }).toEqual({
      rejected: 0,
      unrecognized: 0,
      outOfOrder: 0,
      markers: 0,
      emptyTexts: 0,
      tildeAuthors: 0,
      captionsLost: 0,
      audiosMissing: 0,
      emptyAudioFiles: 0,
    });
    expect(report.imported).toBeGreaterThan(0);
  });

  it("T3 (o único com áudios): 158 áudios vinculados, só contagens", async () => {
    const t3 = files.find((f) => /t3/i.test(f));
    if (!t3) return;
    const { report } = await importInMemory(t3);
    expect({ linked: report.audiosLinked + report.audiosCaptioned, missing: report.audiosMissing }).toEqual({ linked: 158, missing: 0 });
  });
});
