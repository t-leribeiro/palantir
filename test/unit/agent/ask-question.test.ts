// T026: RN-04, RN-05, RF-13 e RF-14 (resposta só com evidências, citações validadas).
import { describe, expect, it } from "vitest";
import {
  NO_EVIDENCE_TEXT,
  createAskQuestion,
  createDeterministicAnswerGenerator,
  validateCitations,
  type AnswerGenerator,
  type Evidence,
  type EvidenceSearch,
} from "../../../src/modules/agent/index.js";
import { canonicalMessage } from "../../support/messages.js";

const ALLOY: Evidence = {
  messageId: "6f1c8a52-1d3e-4a4b-9a0e-2b4f0c9d7e11",
  chunkText: "O Grafana Alloy centraliza a coleta de telemetria",
  score: 0.4,
  author: "Ana",
  sourceTitle: "Grupo de teste",
  sentAt: new Date("2026-11-22T13:00:00.000Z"),
  kind: "text",
};

function evidence(i: number): Evidence {
  return { ...ALLOY, messageId: `00000000-0000-4000-8000-00000000000${i}`, author: `Autor ${i}`, score: 1 / i };
}

const question = canonicalMessage({
  source: { provider: "fake", accountId: "fake-operator", conversationId: "agent" },
  text: "quem falou do Grafana Alloy?",
  provenance: { captureMethod: "forwarded_to_agent", capturedAt: "2026-11-22T10:00:01-03:00", adapter: "fake" },
});

function setup(opts: { user?: boolean; results?: Evidence[]; lowConfidence?: boolean; generator?: AnswerGenerator } = {}) {
  const searches: Parameters<EvidenceSearch["search"]>[0][] = [];
  const ask = createAskQuestion({
    identity: {
      async resolve() {
        return opts.user === false ? null : { userId: "user-1", spaceId: "space-1" };
      },
    },
    search: {
      async search(req) {
        searches.push(req);
        return { results: opts.results ?? [ALLOY], lowConfidence: opts.lowConfidence ?? false };
      },
    },
    generator: opts.generator ?? createDeterministicAnswerGenerator(),
  });
  return { ask, searches };
}

describe("agente: perguntar", () => {
  it("responde com citação de autor, fonte e data", async () => {
    const { ask } = setup();
    const reply = await ask(question);
    expect(reply.outcome).toBe("answered");
    expect(reply.citations).toEqual([
      {
        index: 1,
        messageId: ALLOY.messageId,
        author: "Ana",
        sourceTitle: "Grupo de teste",
        sentAt: "2026-11-22T13:00:00.000Z",
      },
    ]);
    expect(reply.text).toContain("Ana");
    expect(reply.text).toContain("Grupo de teste");
    expect(reply.text).toContain("22/11/2026");
    expect(reply.text).toContain("[1]");
  });

  it("busca no espaço resolvido pela identidade, nunca pelo texto", async () => {
    const { ask, searches } = setup();
    await ask(question);
    expect(searches).toEqual([{ spaceId: "space-1", query: "quem falou do Grafana Alloy?" }]);
  });

  it("cita no máximo 3 evidências, na ordem da busca", async () => {
    const { ask } = setup({ results: [evidence(1), evidence(2), evidence(3), evidence(4)] });
    const reply = await ask(question);
    expect(reply.citations.map((c) => c.author)).toEqual(["Autor 1", "Autor 2", "Autor 3"]);
  });

  it("responde 'não encontrei' quando a busca indica baixa confiança", async () => {
    const { ask } = setup({ lowConfidence: true });
    expect(await ask(question)).toEqual({ text: NO_EVIDENCE_TEXT, outcome: "no_evidence", citations: [] });
  });

  it("responde 'não encontrei' quando não há resultados", async () => {
    const { ask } = setup({ results: [] });
    expect((await ask(question)).outcome).toBe("no_evidence");
  });

  it("não executa busca para conta não vinculada", async () => {
    const { ask, searches } = setup({ user: false });
    const reply = await ask(question);
    expect(searches).toHaveLength(0);
    expect(reply.outcome).toBe("no_evidence");
    expect(reply.text).toContain("vincul");
  });

  it("regenera uma vez quando o gerador cita mensagem fora dos resultados", async () => {
    let calls = 0;
    const flaky: AnswerGenerator = {
      async generate(q, evidences) {
        calls += 1;
        const good = await createDeterministicAnswerGenerator().generate(q, evidences);
        if (calls > 1) return good;
        return { ...good, citations: good.citations.map((c) => ({ ...c, messageId: "99999999-9999-4999-8999-999999999999" })) };
      },
    };
    const reply = await setup({ generator: flaky }).ask(question);
    expect(calls).toBe(2);
    expect(reply.outcome).toBe("answered");
  });

  it("responde 'não encontrei' se a citação continuar inválida após regenerar", async () => {
    const liar: AnswerGenerator = {
      async generate() {
        return {
          text: "inventado [1]",
          outcome: "answered",
          citations: [{ index: 1, messageId: "99999999-9999-4999-8999-999999999999", author: "X", sourceTitle: "Y", sentAt: "2026-11-22T13:00:00.000Z" }],
        };
      },
    };
    expect((await setup({ generator: liar }).ask(question)).outcome).toBe("no_evidence");
  });
});

describe("validateCitations", () => {
  it("aceita citações presentes nos resultados", () => {
    expect(validateCitations([{ messageId: ALLOY.messageId }], [ALLOY])).toBe(true);
  });

  it("rejeita citação ausente dos resultados", () => {
    expect(validateCitations([{ messageId: "outra" }], [ALLOY])).toBe(false);
  });

  it("rejeita resposta 'answered' sem nenhuma citação", () => {
    expect(validateCitations([], [ALLOY], "answered")).toBe(false);
  });
});
