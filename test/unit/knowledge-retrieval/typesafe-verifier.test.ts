// T016 (feature 007, D-10): adaptador do verificador externo contra um fetch falso.
import { describe, expect, it } from "vitest";
import { createFakeVerifier, createTypeSafeVerifier, systemOneBody } from "../../../src/modules/retrieval/index.js";

const candidates = [
  { id: "11111111-aaaa", text: "o Karpenter reduziu o custo", author: "Carla", sourceTitle: "DevOps", sentAt: "2026-11-20T10:00:00.000Z" },
  { id: "22222222-bbbb", text: "o Alloy coleta telemetria", author: "Ana", sourceTitle: "Arquitetura", sentAt: "2026-11-21T10:00:00.000Z" },
];

describe("verificador TypeSafe", () => {
  it("manda uma noul por candidata no mesmo estado, sem o id interno, e lê as probabilidades", async () => {
    let sent: { url: string; body: Record<string, unknown>; auth: string } | undefined;
    const verifier = createTypeSafeVerifier({
      apiKey: "chave",
      model: "jev-1.14.0",
      fetch: (async (url: string, init?: RequestInit) => {
        sent = { url, body: JSON.parse(String(init?.body)) as Record<string, unknown>, auth: (init?.headers as Record<string, string>).authorization ?? "" };
        return new Response(JSON.stringify({ model: "jev-1.14.0", answers: { c0: { type: "noul", noul: 0.92 }, c1: { type: "noul", noul: 0.08 } } }), { status: 200 });
      }) as typeof fetch,
    });
    const p = await verifier.verify("quem baixou o custo?", candidates, AbortSignal.timeout(1000));
    expect(sent?.url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(sent?.auth).toBe("Bearer chave");
    expect(sent?.body.model).toBe("jev-1.14.0");
    expect(Object.keys(sent?.body.questions as object)).toEqual(["c0", "c1"]);
    expect(JSON.stringify(sent?.body)).not.toContain("11111111");
    expect([...p.entries()]).toEqual([
      ["11111111-aaaa", 0.92],
      ["22222222-bbbb", 0.08],
    ]);
  });

  it("resposta sem a candidata a deixa fora; erro HTTP lança sem texto da pergunta", async () => {
    const partial = createTypeSafeVerifier({
      apiKey: "k",
      model: "m",
      fetch: (async () => new Response(JSON.stringify({ answers: { c1: { noul: 0.7 } } }))) as unknown as typeof fetch,
    });
    expect([...(await partial.verify("q", candidates, AbortSignal.timeout(1000))).keys()]).toEqual(["22222222-bbbb"]);
    const refused = createTypeSafeVerifier({ apiKey: "k", model: "m", fetch: (async () => new Response("{}", { status: 429 })) as unknown as typeof fetch });
    await expect(refused.verify("segredo da pergunta", candidates, AbortSignal.timeout(1000))).rejects.toThrow(/HTTP 429/);
    await expect(refused.verify("segredo da pergunta", candidates, AbortSignal.timeout(1000))).rejects.not.toThrow(/segredo/);
  });

  it("o corpo leva pergunta, autor, conversa, data e texto de cada candidata", () => {
    const body = systemOneBody("m", "q", candidates) as { state: { pergunta: string; mensagens: unknown[] } };
    expect(body.state.pergunta).toBe("q");
    expect(body.state.mensagens[0]).toEqual({ autor: "Carla", conversa: "DevOps", data: "2026-11-20T10:00:00.000Z", texto: "o Karpenter reduziu o custo" });
  });

  it("verificador falso: marcador dá 0,9, o resto 0,1; fora do ar lança", async () => {
    const fake = createFakeVerifier({ markers: ["karpenter"] });
    expect([...(await fake.verify("q", candidates, AbortSignal.timeout(1000))).values()]).toEqual([0.9, 0.1]);
    await expect(createFakeVerifier({ down: () => true }).verify("q", candidates, AbortSignal.timeout(1000))).rejects.toThrow();
  });
});
