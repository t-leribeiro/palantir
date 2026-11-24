// T012: adaptador WhatsApp sobre o provedor simulado (RF-04 a RF-07, RF-10 da S2; D-13, D-17).
import { describe, expect, it } from "vitest";
import { createSimulatedProvider } from "../../../src/channels/whatsapp/provider/simulated-provider.js";
import type { IncomingDirect } from "../../../src/channels/whatsapp/provider/provider.js";
import { createWhatsAppChannel, type WhatsAppObserver } from "../../../src/channels/whatsapp/whatsapp-channel.js";
import type { AgentReply, CanonicalMessage } from "../../../src/contracts/channel/knowledge-channel.js";
import { validateCanonicalMessage } from "../../../src/platform/contracts/validator.js";
import { fixedClock } from "../../../src/shared/index.js";

const NOW = new Date("2026-11-23T13:00:00.000Z");
const JID = "5511988887777@s.whatsapp.net";

function memoryReceipts() {
  const seen = new Set<string>();
  return { registerIfNew: async (provider: string, id: string) => !seen.has(`${provider}:${id}`) && Boolean(seen.add(`${provider}:${id}`)) };
}

function observerSpy() {
  const events: string[] = [];
  const observer: WhatsAppObserver = {
    received: (kind) => void events.push(`received:${kind}`),
    replied: (parts) => void events.push(`replied:${parts}`),
    unknownSender: (reason) => void events.push(`unknown:${reason}`),
    sendFailed: () => void events.push("sendFailed"),
    handlerFailed: () => void events.push("handlerFailed"),
    state: (state) => void events.push(`state:${state}`),
    captured: (outcome) => void events.push(`captured:${outcome}`),
    captureDiscarded: (reason) => void events.push(`discarded:${reason}`),
    captureIgnoredMedia: (kind) => void events.push(`media:${kind}`),
  };
  return { observer, events };
}

let seq = 0;
const direct = (overrides: Partial<IncomingDirect> = {}): IncomingDirect => ({
  id: `MSG-${(seq += 1)}`,
  chatJid: JID,
  senderPhone: "+5511988887777",
  kind: "text",
  text: "quem recomendou o Temporal?",
  sentAt: new Date(NOW.getTime() - 5000),
  senderName: "Leandro",
  ...overrides,
});

async function setup(answer: (m: CanonicalMessage) => Promise<AgentReply | null> = async () => ({ text: "Diego recomendou.", outcome: "no_evidence", citations: [] })) {
  const provider = createSimulatedProvider();
  const { observer, events } = observerSpy();
  const asked: CanonicalMessage[] = [];
  const channel = createWhatsAppChannel({
    provider,
    receipts: memoryReceipts(),
    clock: fixedClock(NOW.toISOString()),
    observer,
    sendRetryDelaysMs: [0, 0],
    pacerIntervalMs: 0,
  });
  channel.onAgentMessage(async (m) => {
    asked.push(m);
    return answer(m);
  });
  await channel.connect();
  return { provider, channel, asked, events };
}

describe("createWhatsAppChannel", () => {
  it("leva a mensagem de texto ao agente como CanonicalMessage válida e responde na mesma conversa", async () => {
    const { provider, asked, events } = await setup();
    await provider.deliver(direct());
    expect(asked).toHaveLength(1);
    expect(validateCanonicalMessage(asked[0])).toMatchObject({ ok: true });
    expect(asked[0]).toMatchObject({
      source: { provider: "whatsapp", externalMessageId: "MSG-1" },
      sender: { externalId: "+5511988887777", displayName: "Leandro" },
      kind: "text",
      provenance: { captureMethod: "forwarded_to_agent", adapter: "whatsapp" },
    });
    expect(provider.sent()).toEqual([{ chatJid: JID, text: "Diego recomendou." }]);
    expect(events).toContain("replied:1");
  });

  it("não responde duas vezes à mesma mensagem reentregue", async () => {
    const { provider, asked, events } = await setup();
    const message = direct();
    await provider.deliver(message);
    await provider.deliver(message);
    expect(asked).toHaveLength(1);
    expect(provider.sent()).toHaveLength(1);
    expect(events).toContain("received:duplicate");
  });

  it("ignora mensagem com mais de 10 minutos na chegada", async () => {
    const { provider, asked, events } = await setup();
    await provider.deliver(direct({ sentAt: new Date(NOW.getTime() - 11 * 60_000) }));
    expect(asked).toHaveLength(0);
    expect(events).toContain("received:stale");
  });

  it("fica em silêncio quando o agente devolve null (remetente desconhecido)", async () => {
    const { provider, events } = await setup(async () => null);
    await provider.deliver(direct({ senderPhone: "+5521999990000" }));
    expect(provider.sent()).toEqual([]);
    expect(events).toContain("unknown:unknown");
  });

  it("fica em silêncio sem consultar o agente quando o número do remetente não foi resolvido", async () => {
    const { provider, asked, events } = await setup();
    await provider.deliver(direct({ senderPhone: null }));
    expect(asked).toHaveLength(0);
    expect(provider.sent()).toEqual([]);
    expect(events).toContain("unknown:unresolved");
  });

  it("leva áudio ao agente como kind audio, sem texto", async () => {
    const { provider, asked } = await setup();
    const { text: _text, ...audio } = direct({ kind: "audio" });
    await provider.deliver(audio);
    expect(asked[0]?.kind).toBe("audio");
    expect(asked[0]?.text).toBeUndefined();
    expect(validateCanonicalMessage(asked[0])).toMatchObject({ ok: true });
  });

  it("divide resposta longa em partes, em ordem", async () => {
    const lines = Array.from({ length: 3 }, (_, i) => `${i + 1}. ${"x".repeat(3000)}`).join("\n");
    const { provider } = await setup(async () => ({ text: lines, outcome: "no_evidence", citations: [] }));
    await provider.deliver(direct());
    expect(provider.sent().map((s) => s.text.slice(0, 6))).toEqual(["(1/3)\n", "(2/3)\n", "(3/3)\n"]);
  });

  it("tenta enviar de novo e desiste depois de 3 falhas, sem derrubar o canal", async () => {
    const { provider, events } = await setup();
    provider.failNextSends(2);
    await provider.deliver(direct());
    expect(provider.sent()).toHaveLength(1);
    provider.failNextSends(3);
    await provider.deliver(direct());
    expect(events).toContain("sendFailed");
    await provider.deliver(direct());
    expect(provider.sent()).toHaveLength(2);
  });

  it("falha do agente não gera resposta nem derruba o canal", async () => {
    const { provider, events } = await setup(async () => Promise.reject(new Error("banco fora")));
    await provider.deliver(direct());
    expect(provider.sent()).toEqual([]);
    expect(events).toContain("handlerFailed");
  });

  it("acompanha o estado da sessão e não captura conversas", async () => {
    const { provider, channel, events } = await setup();
    expect(channel.state()).toBe("connected");
    provider.setState("logged_out", "401");
    expect(channel.state()).toBe("logged_out");
    expect(events).toContain("state:logged_out");
    expect(channel.capabilities()).toMatchObject({ supportsLiveCapture: false, supportsMedia: true, maxMessageLength: 4000 });
    expect(await channel.listConversations()).toEqual([]);
  });
});
