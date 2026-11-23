// T024 / RF-08: suíte de contrato reutilizável. Todo adaptador de canal precisa passar nela.
// Uso: runChannelContractSuite("fake", () => createHarness()).
import { describe, expect, it } from "vitest";
import type {
  AgentReply,
  CanonicalMessage,
  KnowledgeChannel,
} from "../../src/contracts/channel/knowledge-channel.js";
import { validateCanonicalMessage } from "../../src/platform/contracts/validator.js";

/** Controle do lado "provedor" do adaptador, para simular o mundo externo nos testes. */
export interface ChannelDriver {
  /** Simula uma mensagem chegando em uma conversa capturada. */
  simulateInbound(text: string): Promise<void>;
  /** Simula o usuário escrevendo para o agente. */
  simulateAgentMessage(text: string): Promise<void>;
  /** Simula queda de conexão com o provedor. */
  simulateDisconnect(): Promise<void>;
  /** Respostas renderizadas que o provedor recebeu do adaptador. */
  deliveredReplies(): readonly { destinationAccountId: string; parts: readonly string[] }[];
  /** Destino válido para `sendReply` neste canal (padrão "destino-1"). */
  readonly replyDestination?: string;
}

export interface ChannelHarness {
  channel: KnowledgeChannel;
  driver: ChannelDriver;
}

export function runChannelContractSuite(name: string, create: () => ChannelHarness | Promise<ChannelHarness>): void {
  describe(`contrato do canal: ${name}`, () => {
    async function connected() {
      const harness = await create();
      const inbound: CanonicalMessage[] = [];
      const toAgent: CanonicalMessage[] = [];
      harness.channel.onMessage(async (m) => {
        inbound.push(m);
        return { outcome: "accepted", messageId: m.id };
      });
      harness.channel.onAgentMessage(async (m) => {
        toAgent.push(m);
        return { text: "ok", outcome: "no_evidence", citations: [] };
      });
      await harness.channel.connect();
      return { ...harness, inbound, toAgent };
    }

    it("declara capacidades coerentes", async () => {
      const { channel } = await create();
      const caps = channel.capabilities();
      expect(caps.maxMessageLength).toBeGreaterThanOrEqual(100);
      expect(typeof caps.supportsLiveCapture).toBe("boolean");
      expect(channel.adapter).toMatch(/^[a-z][a-z0-9-]{1,31}$/);
    });

    it("conecta e desconecta de forma idempotente", async () => {
      const { channel } = await create();
      await channel.connect();
      await channel.connect();
      await channel.disconnect();
      await channel.disconnect();
    });

    it("lista conversas conhecidas (canais que capturam)", async (ctx) => {
      const { channel } = await connected();
      if (!channel.capabilities().supportsLiveCapture) ctx.skip();
      const conversations = await channel.listConversations();
      expect(conversations.length).toBeGreaterThan(0);
      for (const c of conversations) expect(["group", "direct"]).toContain(c.kind);
    });

    it("entrega mensagens capturadas em onMessage como CanonicalMessage válida", async (ctx) => {
      const { channel, driver, inbound } = await connected();
      if (!channel.capabilities().supportsLiveCapture) ctx.skip();
      await driver.simulateInbound("mensagem do grupo");
      expect(inbound).toHaveLength(1);
      const [msg] = inbound;
      expect(validateCanonicalMessage(msg)).toMatchObject({ ok: true });
      expect(msg?.provenance.adapter).toBe(channel.adapter);
      expect(msg?.provenance.captureMethod).toBe("live");
    });

    it("separa mensagens dirigidas ao agente das mensagens capturadas", async () => {
      const { driver, inbound, toAgent } = await connected();
      await driver.simulateAgentMessage("quem falou do Grafana Alloy?");
      expect(toAgent).toHaveLength(1);
      expect(inbound).toHaveLength(0);
      expect(validateCanonicalMessage(toAgent[0])).toMatchObject({ ok: true });
    });

    it("entrega respostas renderizadas dentro do limite do canal", async () => {
      const { channel, driver } = await connected();
      const destination = driver.replyDestination ?? "destino-1";
      const long: AgentReply = { text: "a".repeat(channel.capabilities().maxMessageLength * 2 + 10), outcome: "no_evidence", citations: [] };
      await channel.sendReply(destination, long);
      const [delivered] = driver.deliveredReplies();
      expect(delivered?.destinationAccountId).toBe(destination);
      expect(delivered?.parts.length).toBeGreaterThan(1);
      for (const part of delivered?.parts ?? []) {
        expect(part.length).toBeLessThanOrEqual(channel.capabilities().maxMessageLength);
      }
    });

    it("entrega a resposta de ajuda (contrato 1.2.0)", async () => {
      const { channel, driver } = await connected();
      const destination = driver.replyDestination ?? "destino-1";
      await channel.sendReply(destination, { text: "Posso responder perguntas sobre suas conversas.", outcome: "help", citations: [] });
      expect(driver.deliveredReplies()[0]?.parts).toEqual(["Posso responder perguntas sobre suas conversas."]);
    });

    it("volta a entregar mensagens depois de reconectar", async () => {
      const { channel, driver, inbound, toAgent } = await connected();
      await driver.simulateDisconnect();
      await channel.connect();
      if (channel.capabilities().supportsLiveCapture) {
        await driver.simulateInbound("depois da reconexão");
        expect(inbound).toHaveLength(1);
      } else {
        await driver.simulateAgentMessage("depois da reconexão");
        expect(toAgent).toHaveLength(1);
      }
    });
  });
}
