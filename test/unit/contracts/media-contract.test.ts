// T004 (feature 005): contrato do canal 1.3.0, mídia (interfaces/contrato-canal-midia.md).
import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, MediaUnavailableError } from "../../../src/contracts/channel/knowledge-channel.js";
import { validateAgentReply, validateCanonicalMessage } from "../../../src/platform/contracts/validator.js";
import { canonicalMessage, withoutText } from "../../support/messages.js";

const SHA = "b".repeat(64);
const audio = (attachments: unknown[]): unknown => ({ ...withoutText(canonicalMessage({ contractVersion: "1.3.0", kind: "audio" })), attachments });

function paths(value: unknown): string[] {
  const result = validateCanonicalMessage(value);
  return result.ok ? [] : result.error.details.map((d) => d.path);
}

describe("contrato 1.3.0: anexo de mídia", () => {
  it("a versão do contrato é 1.4.0 (feature 008), aditiva sobre a 1.3.0 e a 1.2.0", () => {
    expect(CONTRACT_VERSION).toBe("1.4.0");
    expect(validateCanonicalMessage(canonicalMessage({ contractVersion: "1.2.0" })).ok).toBe(true);
    expect(validateCanonicalMessage(canonicalMessage({ contractVersion: "1.3.0" })).ok).toBe(true);
  });

  it("aceita áudio anunciado pelo canal, ainda não preparado (só fetchRef)", () => {
    expect(validateCanonicalMessage(audio([{ id: "a1", mimeType: "audio/ogg", fetchRef: "wa:1", durationSeconds: 12 }])).ok).toBe(true);
  });

  it("aceita áudio guardado (status stored com storageKey e sha256) sem texto", () => {
    const stored = { id: "a1", mimeType: "audio/ogg", status: "stored", storageKey: `s/x/${SHA}`, sha256: SHA, durationSeconds: 61.5 };
    expect(validateCanonicalMessage(audio([stored])).ok).toBe(true);
  });

  it("aceita áudio indisponível com o motivo e sem storageKey", () => {
    expect(validateCanonicalMessage(audio([{ id: "a1", mimeType: "audio/ogg", status: "unavailable", unavailableReason: "missing_in_export" }])).ok).toBe(true);
  });

  it("áudio exige ao menos um anexo", () => {
    expect(paths(audio([]))).toContain("/attachments");
  });

  it("stored sem sha256 ou sem storageKey é recusado", () => {
    expect(validateCanonicalMessage(audio([{ id: "a1", mimeType: "audio/ogg", status: "stored", storageKey: "k" }])).ok).toBe(false);
    expect(validateCanonicalMessage(audio([{ id: "a1", mimeType: "audio/ogg", status: "stored", sha256: SHA }])).ok).toBe(false);
  });

  it("unavailable sem motivo, ou com storageKey, é recusado; motivo sem status unavailable também", () => {
    expect(validateCanonicalMessage(audio([{ id: "a1", mimeType: "audio/ogg", status: "unavailable" }])).ok).toBe(false);
    const withKey = { id: "a1", mimeType: "audio/ogg", status: "unavailable", unavailableReason: "too_large", storageKey: "k" };
    expect(validateCanonicalMessage(audio([withKey])).ok).toBe(false);
    expect(validateCanonicalMessage(audio([{ id: "a1", mimeType: "audio/ogg", unavailableReason: "expired" }])).ok).toBe(false);
  });

  it("sha256 fora do formato e duração negativa são recusados", () => {
    expect(validateCanonicalMessage(audio([{ id: "a1", mimeType: "audio/ogg", sha256: "XYZ" }])).ok).toBe(false);
    expect(validateCanonicalMessage(audio([{ id: "a1", mimeType: "audio/ogg", durationSeconds: -1 }])).ok).toBe(false);
  });

  it("MediaUnavailableError carrega o motivo", () => {
    const error = new MediaUnavailableError("expired");
    expect(error.reason).toBe("expired");
    expect(error.message).toBe("mídia indisponível: expired");
  });
});

describe("contrato 1.3.0: citação de áudio", () => {
  const citation = {
    index: 1,
    messageId: "6f1c8a52-1d3e-4a4b-9a0e-2b4f0c9d7e11",
    author: "Ana",
    sourceTitle: "T3",
    sentAt: "2026-11-12T13:00:00.000Z",
  };

  it("aceita citação de áudio com a faixa do trecho", () => {
    const reply = { text: "Ana em T3…", outcome: "answered", citations: [{ ...citation, kind: "audio", audioStartS: 37, audioEndS: 52.5 }] };
    expect(validateAgentReply(reply).ok).toBe(true);
  });

  it("citações de texto continuam válidas sem os campos novos", () => {
    expect(validateAgentReply({ text: "Ana falou.", outcome: "answered", citations: [citation] }).ok).toBe(true);
  });

  it("início sem fim (ou o contrário) é recusado", () => {
    const reply = { text: "x", outcome: "answered", citations: [{ ...citation, kind: "audio", audioStartS: 3 }] };
    expect(validateAgentReply(reply).ok).toBe(false);
  });
});

describe("contrato 1.4.0: anexo de áudio na resposta (feature 008, D-07)", () => {
  const citation = { index: 1, messageId: "6f1c8a52-1d3e-4a4b-9a0e-2b4f0c9d7e11", author: "Ana", sourceTitle: "T3", sentAt: "2026-11-12T13:00:00.000Z" };
  const media = {
    kind: "audio",
    ref: "0a05cfd1-7a02-4687-86d3-dbe8526cf836",
    mimeType: "audio/ogg; codecs=opus",
    durationSeconds: 102,
    sizeBytes: 54_321,
    failureText: "Não consegui mandar o arquivo do áudio agora.",
  };
  const reply = (extra: object) => ({ text: "[1] Ana em T3…", outcome: "answered", citations: [citation], ...extra });

  it("aceita um anexo por referência; resposta sem anexo continua válida", () => {
    expect(validateAgentReply(reply({ media: [media] })).ok).toBe(true);
    expect(validateAgentReply(reply({})).ok).toBe(true);
  });

  it("recusa dois anexos, mais de 16 MB, ref fora de uuid, tipo que não é áudio e anexo sem texto de falha", () => {
    expect(validateAgentReply(reply({ media: [media, media] })).ok).toBe(false);
    expect(validateAgentReply(reply({ media: [{ ...media, sizeBytes: 16 * 1024 * 1024 + 1 }] })).ok).toBe(false);
    expect(validateAgentReply(reply({ media: [{ ...media, ref: "storage/key.ogg" }] })).ok).toBe(false);
    expect(validateAgentReply(reply({ media: [{ ...media, kind: "image" }] })).ok).toBe(false);
    const { failureText: _f, ...semTexto } = media;
    expect(validateAgentReply(reply({ media: [semTexto] })).ok).toBe(false);
  });

  it("os bytes nunca vão na resposta", () => {
    expect(validateAgentReply(reply({ media: [{ ...media, bytes: "T2dnUw==" }] })).ok).toBe(false);
  });
});
