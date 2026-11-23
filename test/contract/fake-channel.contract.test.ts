// O adaptador fake precisa passar 100% da suíte de contrato (RF-07).
import { createFakeChannel } from "../../src/channels/fake/index.js";
import { runChannelContractSuite } from "./channel-contract-suite.js";

let seq = 0;

runChannelContractSuite("fake", () => {
  const channel = createFakeChannel({
    conversations: [{ conversationId: "fake-group-1", title: "Grupo de teste", kind: "group" }],
  });
  return {
    channel,
    driver: {
      async simulateInbound(text) {
        seq += 1;
        await channel.receiveInbound({
          conversationId: "fake-group-1",
          externalMessageId: `contract-${seq}`,
          senderId: "ana",
          senderName: "Ana",
          text,
          timestamp: "2026-11-22T10:00:00-03:00",
        });
      },
      async simulateAgentMessage(text) {
        await channel.receiveAgentMessage({ senderAccountId: "fake-operator", text });
      },
      async simulateDisconnect() {
        await channel.disconnect();
      },
      deliveredReplies() {
        return channel.outbox().map((item) => ({ destinationAccountId: item.destinationAccountId, parts: item.parts }));
      },
    },
  };
});
