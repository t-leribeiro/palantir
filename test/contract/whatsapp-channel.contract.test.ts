// RF-13 da S2: o adaptador WhatsApp passa a mesma suíte de contrato do canal, com o provedor simulado.
import { createSimulatedProvider } from "../../src/channels/whatsapp/provider/simulated-provider.js";
import { createWhatsAppChannel } from "../../src/channels/whatsapp/whatsapp-channel.js";
import { runChannelContractSuite } from "./channel-contract-suite.js";

let seq = 0;
const PHONE = "+5511988887777";
const JID = "5511988887777@s.whatsapp.net";

runChannelContractSuite("whatsapp (provedor simulado)", () => {
  const provider = createSimulatedProvider();
  const seen = new Set<string>();
  const channel = createWhatsAppChannel({
    provider,
    receipts: { registerIfNew: async (p, id) => !seen.has(`${p}:${id}`) && Boolean(seen.add(`${p}:${id}`)) },
    pacerIntervalMs: 0,
    sendRetryDelaysMs: [],
  });
  return {
    channel,
    driver: {
      replyDestination: PHONE,
      async simulateInbound() {
        // O número do agente não captura conversas (supportsLiveCapture = false).
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
        return sent.length === 0 ? [] : [{ destinationAccountId: `+${JID.split("@")[0]}`, parts: sent.map((s) => s.text) }];
      },
    },
  };
});
