// T010 (feature 004, RN-01, RN-07, RN-08, RN-10; D-02, D-05, D-11 a D-13): canal com papel de captura.
import { describe, expect, it } from "vitest";
import { participantDisplayName, type CapturePorts, type CaptureRouteRef } from "../../../src/channels/whatsapp/capture.js";
import type { GroupInfo, IncomingGroupMessage } from "../../../src/channels/whatsapp/provider/provider.js";
import { createSimulatedProvider } from "../../../src/channels/whatsapp/provider/simulated-provider.js";
import { createWhatsAppChannel, type WhatsAppObserver, type WhatsAppRoles } from "../../../src/channels/whatsapp/whatsapp-channel.js";
import type { CanonicalMessage, IngestOutcome } from "../../../src/contracts/channel/knowledge-channel.js";
import { validateCanonicalMessage } from "../../../src/platform/contracts/validator.js";
import { fixedClock } from "../../../src/shared/index.js";

const NOW = new Date("2026-11-23T18:00:00.000Z");
const GROUP = "120363000000000001@g.us";
const AUTHORIZED_AT = new Date("2026-11-23T17:42:00.000Z");
const ROUTE: CaptureRouteRef = { provider: "whatsapp", accountId: "+5519900000000", conversationId: "export:t3", authorizedAt: AUTHORIZED_AT };

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

function memoryPorts(routes: Record<string, CaptureRouteRef> = { [GROUP]: ROUTE }) {
  const synced: [string[], boolean][] = [];
  const known: GroupInfo[] = [];
  const ports: CapturePorts = {
    route: async (groupId) => routes[groupId] ?? null,
    async syncGroups(groups, complete) {
      synced.push([groups.map((g) => g.groupId), complete]);
      if (complete) known.length = 0;
      known.push(...groups);
    },
    knownGroups: async () => known,
  };
  return { ports, synced };
}

let seq = 0;
const groupMessage = (overrides: Partial<IncomingGroupMessage> = {}): IncomingGroupMessage => ({
  id: `G-${(seq += 1)}`,
  groupId: GROUP,
  senderPhone: "+5511988887777",
  senderName: "Ana Souza",
  kind: "text",
  text: "recomendo o Grafana Tempo para traces",
  sentAt: new Date(NOW.getTime() - 5000),
  ...overrides,
});

function setup(roles: WhatsAppRoles = { answer: true, capture: true }, routes?: Record<string, CaptureRouteRef>, outcome: IngestOutcome["outcome"] = "accepted") {
  const provider = createSimulatedProvider();
  const { observer, events } = observerSpy();
  const { ports, synced } = memoryPorts(routes);
  const seen = new Set<string>();
  const channel = createWhatsAppChannel({
    provider,
    receipts: { registerIfNew: async (p, id) => !seen.has(`${p}:${id}`) && Boolean(seen.add(`${p}:${id}`)) },
    observer,
    clock: fixedClock(NOW.toISOString()),
    ids: () => "6f1c8a52-1d3e-4a4b-9a0e-2b4f0c9d7e11",
    pacerIntervalMs: 0,
    sendRetryDelaysMs: [],
    roles,
    capturePorts: ports,
  });
  const inbound: CanonicalMessage[] = [];
  const asked: CanonicalMessage[] = [];
  channel.onMessage(async (m) => {
    inbound.push(m);
    return outcome === "rejected" ? { outcome, reason: "not_authorized" } : { outcome, messageId: "m-1" };
  });
  channel.onAgentMessage(async (m) => {
    asked.push(m);
    return { text: "ok", outcome: "no_evidence", citations: [] };
  });
  return { provider, channel, events, inbound, asked, synced };
}

describe("captura: mensagem de grupo autorizado", () => {
  it("vira CanonicalMessage live válida na fonte autorizada, com autor E.164 e nome de perfil", async () => {
    const { provider, channel, inbound, events } = setup();
    await channel.connect();
    await provider.deliverGroup(groupMessage({ id: "G-ABC" }));
    expect(inbound).toHaveLength(1);
    const [message] = inbound;
    expect(validateCanonicalMessage(message)).toMatchObject({ ok: true });
    expect(message).toMatchObject({
      source: { provider: "whatsapp", accountId: "+5519900000000", conversationId: "export:t3", externalMessageId: "G-ABC" },
      sender: { externalId: "+5511988887777", displayName: "Ana Souza" },
      kind: "text",
      text: "recomendo o Grafana Tempo para traces",
      timestamp: "2026-11-23T17:59:55.000Z",
      provenance: { captureMethod: "live", adapter: "whatsapp", capturedAt: NOW.toISOString() },
    });
    expect(events).toContain("captured:accepted");
  });

  it("registra o resultado da ingestão, inclusive duplicata e reconciliação", async () => {
    for (const outcome of ["duplicate", "reconciled"] as const) {
      const { provider, events } = setup(undefined, undefined, outcome);
      await provider.deliverGroup(groupMessage());
      expect(events).toContain(`captured:${outcome}`);
    }
  });

  it("grupo sem captura ativa: descarta sem chamar a ingestão", async () => {
    const { provider, inbound, events } = setup(undefined, {});
    await provider.deliverGroup(groupMessage());
    expect(inbound).toEqual([]);
    expect(events).toEqual(["discarded:not_authorized"]);
  });

  it("mensagem anterior à autorização: descarta (nada antes do consentimento)", async () => {
    const { provider, inbound, events } = setup();
    await provider.deliverGroup(groupMessage({ sentAt: new Date(AUTHORIZED_AT.getTime() - 1) }));
    await provider.deliverGroup(groupMessage({ sentAt: AUTHORIZED_AT }));
    expect(inbound).toHaveLength(1);
    expect(events).toEqual(["discarded:before_authorization", "captured:accepted"]);
  });

  it("mídia: conta por tipo e descarta, sem ingestão", async () => {
    const { provider, inbound, events } = setup();
    const { text: _text, ...audio } = groupMessage({ kind: "audio" });
    await provider.deliverGroup(audio);
    expect(inbound).toEqual([]);
    expect(events).toEqual(["discarded:media", "media:audio"]);
  });

  it("autor só por LID: identidade lid e nome 'Participante'", async () => {
    const { provider, inbound } = setup();
    const { senderName: _name, ...anonymous } = groupMessage({ senderPhone: null, senderLid: "lid:333" });
    await provider.deliverGroup(anonymous);
    expect(inbound[0]?.sender).toEqual({ externalId: "lid:333", displayName: "Participante" });
  });

  it("falha na ingestão vira handlerFailed, sem derrubar o canal", async () => {
    const { provider, channel, events } = setup();
    channel.onMessage(async () => {
      throw new Error("banco fora");
    });
    await provider.deliverGroup(groupMessage());
    expect(events).toEqual(["handlerFailed"]);
  });
});

describe("participantDisplayName (RN-10)", () => {
  it("nome de perfil, depois número mascarado, depois 'Participante'", () => {
    expect(participantDisplayName({ senderName: "  Ana  ", senderPhone: "+5511988887777" })).toBe("Ana");
    expect(participantDisplayName({ senderName: "   ", senderPhone: "+5511988887777" })).toBe("+55 11 9****-**77");
    expect(participantDisplayName({ senderPhone: null })).toBe("Participante");
    expect(participantDisplayName({ senderName: "x".repeat(250), senderPhone: null })).toHaveLength(200);
  });
});

describe("papéis do canal (D-02)", () => {
  it("modo de um número: mensagem direta continua sendo pergunta e o grupo vira conhecimento", async () => {
    const { provider, asked, inbound } = setup({ answer: true, capture: true });
    await provider.start();
    await provider.deliver({ id: "D-1", chatJid: "5511988887777@s.whatsapp.net", senderPhone: "+5511988887777", kind: "text", text: "quem falou disso?", sentAt: NOW });
    await provider.deliverGroup(groupMessage());
    expect(asked).toHaveLength(1);
    expect(inbound).toHaveLength(1);
    expect(provider.sent().map((s) => s.chatJid)).toEqual(["5511988887777@s.whatsapp.net"]);
  });

  it("número só de captura: mensagem direta é descartada, sem pergunta nem resposta", async () => {
    const { provider, asked, events } = setup({ answer: false, capture: true });
    await provider.start();
    await provider.deliver({ id: "D-2", chatJid: "5511988887777@s.whatsapp.net", senderPhone: "+5511988887777", kind: "text", text: "oi", sentAt: NOW });
    expect(asked).toEqual([]);
    expect(provider.sent()).toEqual([]);
    expect(events).toContain("discarded:direct");
  });

  it("só responder (S2): não captura, não lista conversas e declara sem captura", async () => {
    const { channel } = setup({ answer: true, capture: false });
    expect(channel.capabilities().supportsLiveCapture).toBe(false);
    expect(await channel.listConversations()).toEqual([]);
  });

  it("com captura: declara captura e lista os grupos que o número conhece", async () => {
    const { provider, channel, synced } = setup();
    provider.setGroups([{ groupId: GROUP, subject: "Grupo de teste", participants: 5 }]);
    await nextTick();
    expect(synced).toEqual([[[GROUP], true]]);
    expect(channel.capabilities().supportsLiveCapture).toBe(true);
    expect(await channel.listConversations()).toEqual([{ conversationId: GROUP, title: "Grupo de teste", kind: "group" }]);
  });

  it("captura sem as portas: erro de composição", () => {
    expect(() =>
      createWhatsAppChannel({ provider: createSimulatedProvider(), receipts: { registerIfNew: async () => true }, roles: { answer: false, capture: true } }),
    ).toThrow(/portas de captura/);
  });
});

const nextTick = () => new Promise((resolve) => setImmediate(resolve));
