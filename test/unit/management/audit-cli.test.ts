// T020 (feature 006): comando `npm run auditoria` (interfaces/cli-vinculo-grupos-auditoria.md §3).
import { describe, expect, it } from "vitest";
import { UsageError, formatAudit, parseAuditArgs } from "../../../src/main/audit.js";
import type { AuditEntry } from "../../../src/modules/sources/index.js";

const at = new Date("2026-11-24T21:10:00-03:00");
const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  actorUserId: "u1",
  action: "capture.authorized",
  targetKind: "source",
  targetId: "s1",
  channel: "whatsapp",
  details: {},
  at,
  targetLabel: "Projeto X",
  ...over,
});

describe("parseAuditArgs", () => {
  it("padrão de 50 eventos; desde uma data no fuso de São Paulo", () => {
    expect(parseAuditArgs([])).toEqual({ limit: 50 });
    expect(parseAuditArgs(["--desde", "2026-11-01", "--limite", "10"])).toEqual({ since: new Date("2026-11-01T03:00:00Z"), limit: 10 });
  });

  it.each([["--limite", "0"], ["--limite", "abc"], ["--desde", "01/11/2026"]])("recusa %s %s", (flag, value) => {
    expect(() => parseAuditArgs([flag, value])).toThrow(UsageError);
  });
});

describe("formatAudit", () => {
  it("mostra ação, alvo, quem e contagens; número mascarado; fonte apagada sem nome", () => {
    const text = formatAudit([
      entry({ action: "source.deleted", actorUserId: null, channel: null, targetLabel: null, details: { messages: 9842, audios: 1, objects: 158 } }),
      entry({}),
      entry({ action: "account.verified", targetKind: "channel_account", targetLabel: "+5511988887777" }),
    ]);
    const lines = text.split("\n");
    expect(lines[0]).toMatch(/^Quando\s+Ação\s+Alvo\s+Por\s+Detalhes$/);
    expect(lines[1]).toContain("source.deleted");
    expect(lines[1]).toContain("fonte (apagada)");
    expect(lines[1]).toContain("sistema");
    expect(lines[1]).toContain("9842 mensagens, 1 áudio, 158 objetos");
    expect(lines[2]).toContain("fonte Projeto X");
    expect(lines[3]).toContain("conta +55 11 9****-**77");
    expect(text).not.toContain("988887777");
    expect(lines[1]).toContain("24/11/2026 21:10");
  });

  it("sem eventos", () => {
    expect(formatAudit([])).toBe("Nenhum evento de auditoria no período.");
  });
});
