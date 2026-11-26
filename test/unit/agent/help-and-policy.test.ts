// T006: ajuda para cumprimentos (RF-14 da S2, D-10) e política de remetente desconhecido (RF-05, D-09).
import { describe, expect, it } from "vitest";
import {
  HELP_TEXT,
  NOT_LINKED_TEXT,
  TEXT_ONLY_TEXT,
  createAskQuestion,
  createDeterministicAnswerGenerator,
  isHelpRequest,
  type EvidenceSearch,
} from "../../../src/modules/agent/index.js";
import { canonicalMessage } from "../../support/messages.js";

const ask = (text: string) =>
  canonicalMessage({
    source: { provider: "whatsapp", accountId: "agent", conversationId: "agent:+5511988887777" },
    text,
    provenance: { captureMethod: "forwarded_to_agent", capturedAt: "2026-11-23T10:00:01-03:00", adapter: "whatsapp" },
  });

function setup(opts: { linked?: boolean; unknownSender?: "reply" | "silent" } = {}) {
  const searches: Parameters<EvidenceSearch["search"]>[0][] = [];
  const handler = createAskQuestion({
    identity: { resolve: async () => (opts.linked === false ? null : { userId: "u1", spaceId: "s1" }) },
    search: {
      async search(req) {
        searches.push(req);
        return { results: [], lowConfidence: true };
      },
    },
    generator: createDeterministicAnswerGenerator(),
    ...(opts.unknownSender ? { unknownSender: opts.unknownSender } : {}),
  });
  return { handler, searches };
}

describe("isHelpRequest", () => {
  it("reconhece cumprimentos e pedidos de ajuda, sem acento, caixa nem pontuação", () => {
    for (const text of ["oi", "Oi!", "Olá", "olá!!", "bom dia", "Boa tarde.", "boa noite", "ajuda", "AJUDA?", "help", "menu", "?"]) {
      expect(isHelpRequest(text)).toBe(true);
    }
  });

  it("não confunde pergunta com cumprimento", () => {
    for (const text of ["oi, quem recomendou o Temporal?", "ajuda com kafka", "olá mundo", ""]) {
      expect(isHelpRequest(text)).toBe(false);
    }
  });
});

describe("ajuda (RF-14)", () => {
  it("responde 'oi' com a ajuda, sem busca", async () => {
    const { handler, searches } = setup();
    expect(await handler(ask("oi"))).toEqual({ text: HELP_TEXT, outcome: "help", citations: [] });
    expect(searches).toHaveLength(0);
  });

  it("a ajuda é curta e traz pelo menos 2 exemplos de perguntas", () => {
    expect(HELP_TEXT.length).toBeLessThanOrEqual(600);
    expect(HELP_TEXT.match(/\?/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("a ajuda ensina a guardar e a listar (feature 009, D-19) e não diz mais que só entende texto", () => {
    expect(HELP_TEXT).toContain('"guarda em leituras"');
    expect(HELP_TEXT).toContain('"guardados leituras"');
    expect(HELP_TEXT).not.toContain("só entendo");
  });

  it("remetente desconhecido não recebe a ajuda", async () => {
    const { handler } = setup({ linked: false, unknownSender: "silent" });
    expect(await handler(ask("oi"))).toBeNull();
  });
});

describe("política de remetente desconhecido (RF-05)", () => {
  it("'silent' devolve null e não busca", async () => {
    const { handler, searches } = setup({ linked: false, unknownSender: "silent" });
    expect(await handler(ask("quem recomendou o Temporal?"))).toBeNull();
    expect(searches).toHaveLength(0);
  });

  it("'reply' (padrão, canal de teste) mantém a orientação de vínculo", async () => {
    const { handler, searches } = setup({ linked: false });
    expect((await handler(ask("quem recomendou o Temporal?")))?.text).toBe(NOT_LINKED_TEXT);
    expect(searches).toHaveLength(0);
  });
});

describe("mensagem que não é texto (RF-06 da S2)", () => {
  const audio = () => {
    const { text: _text, ...withoutText } = canonicalMessage({
      source: { provider: "whatsapp", accountId: "agent", conversationId: "agent:+5511988887777" },
      kind: "audio",
      provenance: { captureMethod: "forwarded_to_agent", capturedAt: "2026-11-23T10:00:01-03:00", adapter: "whatsapp" },
    });
    return withoutText;
  };

  it("responde que por enquanto só entende texto, sem busca", async () => {
    const { handler, searches } = setup();
    expect(await handler(audio())).toEqual({ text: TEXT_ONLY_TEXT, outcome: "help", citations: [] });
    expect(searches).toHaveLength(0);
  });

  it("desconhecido com política 'silent' não recebe nem esse aviso", async () => {
    const { handler } = setup({ linked: false, unknownSender: "silent" });
    expect(await handler(audio())).toBeNull();
  });
});
