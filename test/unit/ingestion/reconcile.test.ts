// T004 (feature 004, RN-04, D-09, D-10): regra de reconciliação ao vivo × importada no domínio.
import { describe, expect, it } from "vitest";
import {
  RECONCILE_WINDOW_MS,
  normalizeForMatch,
  normalizeName,
  pickCandidate,
  reconcileDirection,
  type ReconcileCandidate,
} from "../../../src/modules/ingestion/domain/reconcile.js";

const T0 = Date.parse("2026-11-23T14:00:00Z");
const at = (ms: number) => new Date(T0 + ms);
const candidate = (id: string, offsetMs: number, authorName?: string): ReconcileCandidate => ({ id, sentAt: at(offsetMs), authorName });

describe("normalizeForMatch", () => {
  it("ignora caixa, espaços extras e quebras de linha", () => {
    expect(normalizeForMatch("  Recomendo o  Grafana\nTempo ")).toBe("recomendo o grafana tempo");
  });

  it("une formas Unicode equivalentes (NFC) sem tirar acentos", () => {
    expect(normalizeForMatch("reunião")).toBe("reunião");
    expect(normalizeForMatch("reunião")).not.toBe(normalizeForMatch("reuniao"));
  });
});

describe("normalizeName", () => {
  it("compara nomes sem acento nem caixa", () => {
    expect(normalizeName(" João  Silva ")).toBe(normalizeName("joao silva"));
  });
});

describe("reconcileDirection", () => {
  it("importada (só chave de importação) procura uma ao vivo", () => {
    expect(reconcileDirection({ importKey: "k", externalMessageId: undefined, text: "oi" })).toBe("import_to_live");
  });

  it("ao vivo (só id externo) procura uma importada", () => {
    expect(reconcileDirection({ importKey: undefined, externalMessageId: "X", text: "oi" })).toBe("live_to_import");
  });

  it("sem texto, com as duas chaves ou sem nenhuma, não reconcilia", () => {
    expect(reconcileDirection({ importKey: "k", externalMessageId: undefined, text: undefined })).toBeUndefined();
    expect(reconcileDirection({ importKey: "k", externalMessageId: undefined, text: "   " })).toBeUndefined();
    expect(reconcileDirection({ importKey: "k", externalMessageId: "X", text: "oi" })).toBeUndefined();
    expect(reconcileDirection({ importKey: undefined, externalMessageId: undefined, text: "oi" })).toBeUndefined();
  });
});

describe("pickCandidate", () => {
  const target = { sentAt: at(0), authorName: "Ana" };

  it("a janela é de 60 s, inclusive nas bordas", () => {
    expect(RECONCILE_WINDOW_MS).toBe(60_000);
    expect(pickCandidate(target, [candidate("a", 60_000)])?.id).toBe("a");
    expect(pickCandidate(target, [candidate("a", -60_000)])?.id).toBe("a");
    expect(pickCandidate(target, [candidate("a", 60_001)])).toBeUndefined();
    expect(pickCandidate(target, [candidate("a", -60_001)])).toBeUndefined();
  });

  it("sem candidatas, nada", () => {
    expect(pickCandidate(target, [])).toBeUndefined();
  });

  it("vence a mais próxima no horário, mesmo com outro autor", () => {
    expect(pickCandidate(target, [candidate("longe", 40_000, "Ana"), candidate("perto", 5_000, "Bruno")])?.id).toBe("perto");
  });

  it("empate no horário: vence o mesmo nome de autor (sem acento nem caixa)", () => {
    const named = { sentAt: at(0), authorName: "JOÃO" };
    expect(pickCandidate(named, [candidate("b", 10_000, "Bruno"), candidate("j", -10_000, "joao")])?.id).toBe("j");
  });

  it("empate sem autor: vence o menor horário e depois o menor id", () => {
    const anonymous = { sentAt: at(0), authorName: undefined };
    expect(pickCandidate(anonymous, [candidate("x", 10_000), candidate("y", -10_000)])?.id).toBe("y");
    expect(pickCandidate(anonymous, [candidate("b", 10_000), candidate("a", 10_000)])?.id).toBe("a");
    expect(pickCandidate(anonymous, [candidate("a", 10_000), candidate("b", 10_000)])?.id).toBe("a");
  });

  it("candidata sem nome não ganha o desempate por autor", () => {
    expect(pickCandidate(target, [candidate("sem", 10_000), candidate("ana", -10_000, "Ana")])?.id).toBe("ana");
    expect(pickCandidate(target, [candidate("ana", 10_000, "Ana"), candidate("sem", -10_000)])?.id).toBe("ana");
  });
});
