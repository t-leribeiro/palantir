// T011: importador com portas falsas (RF-01, RF-06, RF-07, RF-09; RN-02, RN-03, RN-05).
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { importWhatsAppExport, type ImportDeps } from "../../../src/channels/whatsapp-export/index.js";
import type { CanonicalMessage } from "../../../src/contracts/channel/knowledge-channel.js";

const sample = (name: string) => fileURLToPath(new URL(`../../fixtures/whatsapp-export/${name}`, import.meta.url));

function deps() {
  const stored = new Map<string, CanonicalMessage>();
  const ensured: string[] = [];
  const d: ImportDeps = {
    async ensureSource(title) {
      ensured.push(title);
      return { provider: "whatsapp", accountId: "unlinked:u1", conversationId: "export:comunidade-devops", title };
    },
    async ingest(message) {
      const key = message.source.importKey ?? "";
      if (stored.has(key)) return { outcome: "duplicate", messageId: "existing" };
      stored.set(key, message);
      return { outcome: "accepted", messageId: message.id };
    },
  };
  return { d, stored, ensured };
}

describe("importWhatsAppExport", () => {
  it("importa as mensagens de texto e gera o relatório", async () => {
    const { d, stored, ensured } = deps();
    const report = await importWhatsAppExport(sample("android-pt-br.txt"), { conversation: "Comunidade DevOps" }, d);
    expect(ensured).toEqual(["Comunidade DevOps"]);
    expect(report).toEqual({
      conversation: "Comunidade DevOps",
      period: { from: new Date("2026-11-10T13:00:00.000Z"), to: new Date("2026-11-11T11:30:00.000Z") },
      imported: 5,
      existing: 0,
      rejected: 0,
      systemIgnored: 3,
      mediaFound: 2,
      unrecognizedLines: 0,
    });
    const diego = [...stored.values()].find((m) => m.sender.displayName === "Diego");
    expect(diego).toMatchObject({
      timestamp: "2026-11-10T13:00:00.000Z",
      kind: "text",
      sender: { externalId: "diego", displayName: "Diego" },
      source: { provider: "whatsapp", accountId: "unlinked:u1", conversationId: "export:comunidade-devops" },
      provenance: { captureMethod: "export_import", adapter: "whatsapp-export" },
    });
    expect(diego?.source.importKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reimportar não grava nada novo", async () => {
    const { d, stored } = deps();
    await importWhatsAppExport(sample("android-pt-br.txt"), { conversation: "Comunidade DevOps" }, d);
    const again = await importWhatsAppExport(sample("android-pt-br.txt"), { conversation: "Comunidade DevOps" }, d);
    expect(again).toMatchObject({ imported: 0, existing: 5 });
    expect(stored.size).toBe(5);
  });

  it("respeita o fuso informado", async () => {
    const { d, stored } = deps();
    await importWhatsAppExport(sample("android-pt-br.txt"), { conversation: "Comunidade DevOps", timeZone: "UTC" }, d);
    expect([...stored.values()][0]?.timestamp).toBe("2026-11-10T10:00:00.000Z");
  });

  it("não cria fonte nem grava nada quando o formato é recusado", async () => {
    const { d, stored, ensured } = deps();
    await expect(importWhatsAppExport(sample("not-whatsapp.txt"), { conversation: "X" }, d)).rejects.toMatchObject({ code: "unrecognized_format" });
    await expect(importWhatsAppExport(sample("ambiguous-en.txt"), { conversation: "X" }, d)).rejects.toMatchObject({ code: "ambiguous_date" });
    expect(ensured).toEqual([]);
    expect(stored.size).toBe(0);
  });
});
