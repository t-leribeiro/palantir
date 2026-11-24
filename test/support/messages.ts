import type { CanonicalMessage } from "../../src/contracts/channel/knowledge-channel.js";

/** Mensagem canônica válida para testes; sobrescreva só o que importa no caso. */
export function canonicalMessage(overrides: Partial<CanonicalMessage> = {}): CanonicalMessage {
  return {
    contractVersion: "1.0.0",
    id: "6f1c8a52-1d3e-4a4b-9a0e-2b4f0c9d7e11",
    source: {
      provider: "fake",
      accountId: "fake-operator",
      conversationId: "fake-group-1",
      externalMessageId: "m-1",
    },
    sender: { externalId: "ana", displayName: "Ana" },
    timestamp: "2026-11-22T10:00:00-03:00",
    kind: "text",
    text: "O Grafana Alloy centraliza a coleta de telemetria",
    isForwarded: false,
    attachments: [],
    provenance: { captureMethod: "live", capturedAt: "2026-11-22T10:00:01-03:00", adapter: "fake" },
    ...overrides,
  };
}

/** A mesma mensagem sem `text` (áudio sem legenda, contrato 1.3.0), respeitando exactOptionalPropertyTypes. */
export function withoutText(message: CanonicalMessage): CanonicalMessage {
  const { text: _text, ...rest } = message;
  return rest;
}
