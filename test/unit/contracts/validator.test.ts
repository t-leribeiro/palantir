// T023: validação do contrato do canal (RF-06; interfaces/channel-contract.md).
import { describe, expect, it } from "vitest";
import { validateAgentReply, validateCanonicalMessage } from "../../../src/platform/contracts/validator.js";
import { canonicalMessage } from "../../support/messages.js";

function without<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key)) as Omit<T, K>;
}

describe("validateCanonicalMessage", () => {
  it("aceita uma mensagem válida", () => {
    expect(validateCanonicalMessage(canonicalMessage())).toEqual({ ok: true, value: canonicalMessage() });
  });

  it("aceita provider desconhecido (texto livre, WhatsApp-first, not only)", () => {
    const msg = canonicalMessage({ source: { ...canonicalMessage().source, provider: "telegram" } });
    expect(validateCanonicalMessage(msg).ok).toBe(true);
  });

  it("rejeita campo obrigatório ausente indicando o caminho", () => {
    const result = validateCanonicalMessage(without(canonicalMessage(), "timestamp"));
    expect(result).toMatchObject({ ok: false, error: { code: "contract.invalid" } });
    if (!result.ok) expect(result.error.details).toContainEqual(expect.objectContaining({ path: "/timestamp" }));
  });

  it("rejeita timestamp sem fuso", () => {
    const result = validateCanonicalMessage(canonicalMessage({ timestamp: "2026-11-22T10:00:00" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details.map((d) => d.path)).toContain("/timestamp");
  });

  it("rejeita captureMethod fora da lista", () => {
    const msg = { ...canonicalMessage(), provenance: { ...canonicalMessage().provenance, captureMethod: "scraped" } };
    const result = validateCanonicalMessage(msg);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details.map((d) => d.path)).toContain("/provenance/captureMethod");
  });

  it("rejeita mensagem de texto sem texto", () => {
    expect(validateCanonicalMessage(without(canonicalMessage(), "text")).ok).toBe(false);
  });

  it("exige externalMessageId em captura ao vivo e dispensa em importação", () => {
    const source = without(canonicalMessage().source, "externalMessageId");
    expect(validateCanonicalMessage(canonicalMessage({ source })).ok).toBe(false);
    const imported = canonicalMessage({
      source: { ...source, importKey: "a".repeat(64) },
      provenance: { ...canonicalMessage().provenance, captureMethod: "export_import" },
    });
    expect(validateCanonicalMessage(imported).ok).toBe(true);
  });

  it("contrato 1.1: exige importKey (SHA-256 hex) em mensagem importada", () => {
    const source = without(canonicalMessage().source, "externalMessageId");
    const provenance = { ...canonicalMessage().provenance, captureMethod: "export_import" as const };
    const missing = validateCanonicalMessage(canonicalMessage({ source, provenance }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.details.map((d) => d.path)).toContain("/source/importKey");
    const malformed = validateCanonicalMessage(canonicalMessage({ source: { ...source, importKey: "xyz" }, provenance }));
    expect(malformed.ok).toBe(false);
  });

  it("aceita mensagens 1.0.0, 1.1.0 e 1.2.0 (mudanças aditivas)", () => {
    expect(validateCanonicalMessage(canonicalMessage({ contractVersion: "1.0.0" })).ok).toBe(true);
    expect(validateCanonicalMessage(canonicalMessage({ contractVersion: "1.1.0" })).ok).toBe(true);
    expect(validateCanonicalMessage(canonicalMessage({ contractVersion: "1.2.0" })).ok).toBe(true);
  });

  it("rejeita campos extras", () => {
    expect(validateCanonicalMessage({ ...canonicalMessage(), extra: 1 }).ok).toBe(false);
  });

  it("rejeita versão maior incompatível com código próprio", () => {
    const result = validateCanonicalMessage(canonicalMessage({ contractVersion: "2.0.0" }));
    expect(result).toMatchObject({ ok: false, error: { code: "contract.version_unsupported" } });
  });

  it("rejeita entrada que não é objeto", () => {
    expect(validateCanonicalMessage(null)).toMatchObject({ ok: false, error: { code: "contract.invalid" } });
  });
});

describe("validateAgentReply", () => {
  const citation = {
    index: 1,
    messageId: "6f1c8a52-1d3e-4a4b-9a0e-2b4f0c9d7e11",
    author: "Ana",
    sourceTitle: "Grupo de teste",
    sentAt: "2026-11-22T13:00:00.000Z",
  };

  it("aceita resposta com citação", () => {
    expect(validateAgentReply({ text: "Ana falou.", outcome: "answered", citations: [citation] }).ok).toBe(true);
  });

  it("rejeita resposta 'answered' sem citações", () => {
    expect(validateAgentReply({ text: "Ana falou.", outcome: "answered", citations: [] }).ok).toBe(false);
  });

  it("aceita 'no_evidence' sem citações", () => {
    const reply = { text: "Não encontrei evidências suficientes.", outcome: "no_evidence", citations: [] };
    expect(validateAgentReply(reply).ok).toBe(true);
  });

  it("aceita 'help' sem citações (contrato 1.2.0)", () => {
    expect(validateAgentReply({ text: "Posso responder perguntas.", outcome: "help", citations: [] }).ok).toBe(true);
  });

  it("rejeita outcome desconhecido", () => {
    expect(validateAgentReply({ text: "oi", outcome: "greeting", citations: [] }).ok).toBe(false);
  });
});
