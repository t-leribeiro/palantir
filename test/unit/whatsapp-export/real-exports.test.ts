// Teste local sobre exportações reais em `exports/` (fora do git: dados de terceiros, repositório público).
// Sem arquivos (CI, máquinas de outras pessoas), é pulado. As verificações só contam violações, para que uma
// falha nunca imprima conteúdo de mensagem.
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { importWhatsAppExport, type ImportDeps } from "../../../src/channels/whatsapp-export/index.js";
import type { CanonicalMessage } from "../../../src/contracts/channel/knowledge-channel.js";

const dir = fileURLToPath(new URL("../../../exports/", import.meta.url));
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(zip|txt)$/i.test(f)) : [];

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
  };
  const report = await importWhatsAppExport(`${dir}${file}`, { conversation: "local" }, deps);
  return { report, stored };
}

describe.skipIf(files.length === 0)("exportações reais locais (exports/)", () => {
  it.each(files)("%s: importa sem rejeitar, sem mensagens falsas nem marcadores do app", async (file) => {
    const { report, stored } = await importInMemory(file);
    const outOfOrder = stored.filter((m, i) => i > 0 && m.timestamp < (stored[i - 1]?.timestamp ?? "")).length;
    const markers = stored.filter((m) => APP_MARKERS.test(m.text ?? "")).length;
    const emptyTexts = stored.filter((m) => (m.text ?? "").trim() === "").length;
    const tildeAuthors = stored.filter((m) => m.sender.displayName?.startsWith("~")).length;
    expect({ rejected: report.rejected, unrecognized: report.unrecognizedLines, outOfOrder, markers, emptyTexts, tildeAuthors }).toEqual({
      rejected: 0,
      unrecognized: 0,
      outOfOrder: 0,
      markers: 0,
      emptyTexts: 0,
      tildeAuthors: 0,
    });
    expect(report.imported).toBeGreaterThan(0);
  });
});
