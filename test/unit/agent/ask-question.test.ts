// T026: RN-04, RN-05, RF-13 e RF-14 (resposta só com evidências, citações validadas).
import { describe, expect, it } from "vitest";
import {
  NO_AUDIO_EVIDENCE_TEXT,
  NO_EVIDENCE_TEXT,
  createAskQuestion,
  createDeterministicAnswerGenerator,
  questionScope,
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
  // Canal de teste: política "reply", então a resposta nunca é null.
  const answer = async (message: Parameters<typeof ask>[0]) => {
    const reply = await ask(message);
    if (!reply) throw new Error("resposta nula inesperada");
    return reply;
  };
  return { ask: answer, searches };
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

  it("E001: pergunta sobre áudio busca só áudios, sem a palavra 'áudio' nos termos", async () => {
    const { ask, searches } = setup();
    await ask({ ...question, text: "em qual áudio falaram de Apenas um teste?" });
    expect(searches).toEqual([{ spaceId: "space-1", query: "em qual falaram de Apenas um teste?", kind: "audio" }]);
  });

  it("E001: sem áudio sobre o assunto, avisa que não achou áudio", async () => {
    const { ask } = setup({ results: [] });
    expect(await ask({ ...question, text: "algum áudio sobre o orçamento?" })).toEqual({ text: NO_AUDIO_EVIDENCE_TEXT, outcome: "no_evidence", citations: [] });
    expect((await setup({ lowConfidence: true }).ask({ ...question, text: "em qual audio falaram de X" })).text).toBe(NO_AUDIO_EVIDENCE_TEXT);
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

describe("questionScope (E001)", () => {
  it("reconhece áudio e áudios, com ou sem acento e em qualquer caixa", () => {
    expect(questionScope("em qual Áudio falaram de X?")).toEqual({ query: "em qual falaram de X?", onlyAudio: true });
    expect(questionScope("tem audios sobre X")).toEqual({ query: "tem sobre X", onlyAudio: true });
    expect(questionScope("áudio")).toEqual({ query: "", onlyAudio: true });
  });

  it("não confunde palavras que só contêm 'áudio' nem mexe em pergunta comum", () => {
    expect(questionScope("audiovisual e audiência")).toEqual({ query: "audiovisual e audiência", onlyAudio: false });
    expect(questionScope("  quem   falou do Alloy? ")).toEqual({ query: "quem falou do Alloy?", onlyAudio: false });
  });
});

describe("questionScope com nome de conversa (feature 006, RN-11)", () => {
  const catalog = [
    { sourceId: "s-t3", title: "T3" },
    { sourceId: "s-casa", title: "Contas da Casa" },
    { sourceId: "s-contas", title: "Contas" },
    { sourceId: "s-fam1", title: "Família" },
    { sourceId: "s-fam2", title: "família" },
  ];

  it("o nome completo vira filtro e sai da pergunta, combinado com 'em qual áudio'", () => {
    expect(questionScope("em qual áudio do T3 falaram de Titanium?", catalog)).toEqual({ query: "em qual do falaram de Titanium?", onlyAudio: true, sourceIds: ["s-t3"] });
    expect(questionScope("no Contas da Casa, quem falou do aluguel?", catalog)).toEqual({ query: "no , quem falou do aluguel?", onlyAudio: false, sourceIds: ["s-casa"] });
  });

  it("vale o nome mais longo e só palavra inteira; sem nome, sem filtro", () => {
    expect(questionScope("quem falou das contas da casa?", catalog).sourceIds).toEqual(["s-casa"]);
    expect(questionScope("quem falou das contas?", catalog).sourceIds).toEqual(["s-contas"]);
    expect(questionScope("quem falou de T30?", catalog)).toEqual({ query: "quem falou de T30?", onlyAudio: false });
    expect(questionScope("quem falou de Kafka?", catalog)).toEqual({ query: "quem falou de Kafka?", onlyAudio: false });
  });

  it("nome de mais de uma conversa não busca", () => {
    expect(questionScope("na Família, quem falou do Natal?", catalog)).toEqual({ query: "na , quem falou do Natal?", onlyAudio: false, ambiguousTitle: "Família" });
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

describe("agente: 'mostra a N' (feature 008, D-01, D-03)", () => {
  function withShow(results: () => Evidence[]) {
    const saved: { userId: string; provider: string; items: readonly unknown[] }[] = [];
    const shown: number[] = [];
    let searches = 0;
    const ask = createAskQuestion({
      identity: { resolve: async () => ({ userId: "user-1", spaceId: "space-1" }) },
      search: {
        async search() {
          searches += 1;
          const r = results();
          return { results: r, lowConfidence: r.length === 0 };
        },
      },
      generator: createDeterministicAnswerGenerator(),
      showSource: {
        citations: { citations: async () => null, saveCitations: async (userId, provider, c) => void saved.push({ userId, provider, items: c.items }) },
        show: async (_ctx, index) => (shown.push(index), { text: `original ${index}`, outcome: "answered", citations: [] }),
      },
    });
    const send = (text: string) => ask({ ...question, text });
    return { send, saved, shown, searches: () => searches };
  }

  it("guarda só ids e a faixa das citações de cada resposta com citações; 'não encontrei' não guarda", async () => {
    let results: Evidence[] = [{ ...ALLOY, kind: "audio", audioStartS: 37, audioEndS: 45 }, evidence(2)];
    const { send, saved } = withShow(() => results);
    await send("quem falou do Grafana Alloy?");
    expect(saved).toEqual([
      {
        userId: "user-1",
        provider: "fake",
        items: [
          { index: 1, messageId: ALLOY.messageId, kind: "audio", audioStartS: 37, audioEndS: 45 },
          { index: 2, messageId: evidence(2).messageId, kind: "text" },
        ],
      },
    ]);
    results = [];
    expect((await send("quem falou de Kubernetes?"))?.outcome).toBe("no_evidence");
    expect(saved).toHaveLength(1);
  });

  it("'mostra a 2' vai ao serviço sem buscar; frase com 'mostra' continua pergunta; a ajuda ensina o comando", async () => {
    const { send, shown, searches } = withShow(() => [ALLOY]);
    expect((await send("Mostra a 2"))?.text).toBe("original 2");
    expect(shown).toEqual([2]);
    expect(searches()).toBe(0);
    await send("me mostra o que a Ana disse do Alloy");
    expect(searches()).toBe(1);
    expect((await send("ajuda"))?.text).toContain('"mostra a 2"');
  });
});
