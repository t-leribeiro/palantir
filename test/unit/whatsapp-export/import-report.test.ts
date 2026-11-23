// T013 (feature 004, interfaces/ingestao-reconciliacao.md): relatório do `npm run import`.
import { describe, expect, it } from "vitest";
import type { ImportReport } from "../../../src/channels/whatsapp-export/index.js";
import { formatReport } from "../../../src/main/import.js";

const base: ImportReport = {
  conversation: "T3",
  period: { from: new Date("2025-11-06T12:00:00Z"), to: new Date("2026-11-21T12:00:00Z") },
  imported: 2593,
  existing: 0,
  reconciled: 0,
  rejected: 0,
  systemIgnored: 29,
  mediaFound: 835,
  unrecognizedLines: 0,
};

describe("formatReport", () => {
  it("sem reconciliadas, não mostra a linha", () => {
    const text = formatReport(base);
    expect(text).toContain("Mensagens importadas: 2.593");
    expect(text).not.toContain("Reconciliadas");
  });

  it("com reconciliadas, mostra a linha logo depois das já existentes", () => {
    const lines = formatReport({ ...base, imported: 10, existing: 5, reconciled: 20 }).split("\n");
    const existing = lines.indexOf("Já existentes (reimportação): 5");
    expect(existing).toBeGreaterThan(0);
    expect(lines[existing + 1]).toBe("Reconciliadas com a captura ao vivo: 20");
  });
});
