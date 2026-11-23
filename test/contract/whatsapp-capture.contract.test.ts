// RF-12 da S3: o WhatsApp com papel de captura passa a suíte de contrato do canal, inclusive os testes de
// captura (listar conversas e entregar mensagens `live`), com o provedor simulado.
import type { CapturePorts } from "../../src/channels/whatsapp/capture.js";
import { createSimulatedProvider } from "../../src/channels/whatsapp/provider/simulated-provider.js";
import { createWhatsAppChannel } from "../../src/channels/whatsapp/whatsapp-channel.js";
import { runChannelContractSuite } from "./channel-contract-suite.js";

let seq = 0;
const PHONE = "+5511988887777";
const JID = "5511988887777@s.whatsapp.net";
const GROUP = "120363000000000001@g.us";

runChannelContractSuite("whatsapp com captura (provedor simulado)", () => {
  const provider = createSimulatedProvider();
  const seen = new Set<string>();
  const known = [{ groupId: GROUP, subject: "Grupo de teste" }];
  const capturePorts: CapturePorts = {
    route: async (groupId) =>
      groupId === GROUP ? { provider: "whatsapp", accountId: PHONE, conversationId: "export:grupo-de-teste", authorizedAt: new Date(0) } : null,
    syncGroups: async () => undefined,
    knownGroups: async () => known,
  };
  const channel = createWhatsAppChannel({
    provider,
    receipts: { registerIfNew: async (p, id) => !seen.has(`${p}:${id}`) && Boolean(seen.add(`${p}:${id}`)) },
    pacerIntervalMs: 0,
    sendRetryDelaysMs: [],
    roles: { answer: true, capture: true },
    capturePorts,
  });
  return {
    channel,
    driver: {
      replyDestination: PHONE,
      async simulateInbound(text) {
        seq += 1;
        await provider.deliverGroup({ id: `CAPTURE-${seq}`, groupId: GROUP, senderPhone: PHONE, senderName: "Ana", kind: "text", text, sentAt: new Date() });
      },
      async simulateAgentMessage(text) {
        seq += 1;
        await provider.deliver({ id: `CONTRACT-${seq}`, chatJid: JID, senderPhone: PHONE, kind: "text", text, sentAt: new Date() });
      },
      async simulateDisconnect() {
        provider.setState("reconnecting");
        await channel.disconnect();
      },
      deliveredReplies() {
        const sent = provider.sent();
        return sent.length === 0 ? [] : [{ destinationAccountId: PHONE, parts: sent.map((s) => s.text) }];
      },
    },
  };
});
