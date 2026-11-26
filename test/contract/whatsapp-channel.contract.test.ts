// RF-13 da S2: o adaptador WhatsApp passa a mesma suíte de contrato do canal, com o provedor simulado.
import { createSimulatedProvider } from "../../src/channels/whatsapp/provider/simulated-provider.js";
import { createWhatsAppChannel } from "../../src/channels/whatsapp/whatsapp-channel.js";
import { runChannelContractSuite } from "./channel-contract-suite.js";

let seq = 0;
const PHONE = "+5511988887777";
const JID = "5511988887777@s.whatsapp.net";

runChannelContractSuite("whatsapp (provedor simulado)", (options) => {
  const provider = createSimulatedProvider();
  const seen = new Set<string>();
  const channel = createWhatsAppChannel({
    provider,
    receipts: { registerIfNew: async (p, id) => !seen.has(`${p}:${id}`) && Boolean(seen.add(`${p}:${id}`)) },
    pacerIntervalMs: 0,
    sendRetryDelaysMs: [],
    ...(options?.loadMedia ? { loadMedia: options.loadMedia } : {}),
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
      async simulateDirect(input) {
        const base = {
          id: input.id,
          chatJid: JID,
          senderPhone: PHONE,
          sentAt: new Date(),
          ...(input.isForwarded ? { isForwarded: true } : {}),
          ...(input.quotedId ? { quotedId: input.quotedId } : {}),
        };
        if (input.kind === "audio") return provider.deliverAudio(base, { bytes: input.audio ?? new Uint8Array([1]) });
        if (input.kind === "image") return provider.deliver({ ...base, kind: "image", ...(input.caption ? { caption: input.caption } : {}) });
        return provider.deliver({ ...base, kind: "text", ...(input.text ? { text: input.text } : {}) });
      },
      async simulateDisconnect() {
        provider.setState("reconnecting");
        await channel.disconnect();
      },
      deliveredReplies() {
        const sent = provider.sent();
        return sent.length === 0 ? [] : [{ destinationAccountId: `+${JID.split("@")[0]}`, parts: sent.map((s) => s.text) }];
      },
      deliveredMedia() {
        return provider.sentAudios().map((a) => ({ destinationAccountId: `+${a.chatJid.split("@")[0]}`, sizeBytes: a.sizeBytes, sha256: a.sha256 }));
      },
    },
  };
});
