// T024 / RF-08: suíte de contrato reutilizável. Todo adaptador de canal precisa passar nela.
// Uso: runChannelContractSuite("fake", (options) => createHarness(options)).
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MediaUnavailableError,
  type AgentReply,
  type CanonicalMessage,
  type KnowledgeChannel,
  type OutboundMediaLoader,
  type ReplyMedia,
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
  /** Feature 005: simula um áudio chegando numa conversa capturada (canais com mídia). */
  simulateInboundAudio?(bytes: Uint8Array): Promise<void>;
  /** Os próximos `count` downloads de mídia falham. */
  failNextDownloads?(count: number): void;
  /** Feature 008: anexos que o provedor recebeu do adaptador, na ordem (canais com mídia). */
  deliveredMedia?(): readonly { destinationAccountId: string; sizeBytes: number; sha256: string }[];
  /** Feature 009: o dono escrevendo ao agente com encaminhada, citação, legenda ou áudio. */
  simulateDirect?(input: DirectInput): Promise<void>;
}

/** Mensagem do dono ao agente na suíte (feature 009, interfaces/canal-encaminhado.md §1). */
export interface DirectInput {
  readonly id: string;
  readonly kind?: "text" | "image" | "audio";
  readonly text?: string;
  readonly caption?: string;
  readonly isForwarded?: boolean;
  readonly quotedId?: string;
  readonly audio?: Uint8Array;
}

/** Opções de construção do adaptador na suíte (feature 008: o loader do anexo da resposta). */
export interface HarnessOptions {
  readonly loadMedia?: OutboundMediaLoader;
}

export interface ChannelHarness {
  channel: KnowledgeChannel;
  driver: ChannelDriver;
}

export function runChannelContractSuite(name: string, create: (options?: HarnessOptions) => ChannelHarness | Promise<ChannelHarness>): void {
  describe(`contrato do canal: ${name}`, () => {
    async function connected(options?: HarnessOptions) {
      const harness = await create(options);
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

    it("mídia (1.3.0): anuncia o áudio com fetchRef e entrega os bytes por fetchMedia", async (ctx) => {
      const { channel, driver, inbound } = await connected();
      if (!channel.capabilities().supportsMedia || !driver.simulateInboundAudio) ctx.skip();
      const bytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3]);
      await driver.simulateInboundAudio?.(bytes);
      const [msg] = inbound;
      expect(validateCanonicalMessage(msg)).toMatchObject({ ok: true });
      expect(msg?.kind).toBe("audio");
      const ref = msg?.attachments[0]?.fetchRef;
      expect(ref).toBeTypeOf("string");
      expect(msg?.attachments[0]?.status).toBeUndefined();
      expect(Buffer.from((await channel.fetchMedia(ref ?? "")).bytes).equals(Buffer.from(bytes))).toBe(true);
    });

    it("mídia (1.3.0): referência inválida rejeita com MediaUnavailableError", async (ctx) => {
      const { channel } = await connected();
      if (!channel.capabilities().supportsMedia) ctx.skip();
      await expect(channel.fetchMedia("referencia-inexistente")).rejects.toBeInstanceOf(MediaUnavailableError);
    });

    it("mídia (1.3.0): falha no download não perde a mensagem", async (ctx) => {
      const { channel, driver, inbound } = await connected();
      if (!channel.capabilities().supportsMedia || !driver.simulateInboundAudio || !driver.failNextDownloads) ctx.skip();
      await driver.simulateInboundAudio?.(new Uint8Array([9, 9, 9]));
      driver.failNextDownloads?.(1);
      const ref = inbound[0]?.attachments[0]?.fetchRef ?? "";
      await expect(channel.fetchMedia(ref)).rejects.toMatchObject({ reason: "download_failed" });
      expect(inbound).toHaveLength(1);
      expect((await channel.fetchMedia(ref)).bytes).toHaveLength(3);
    });

    const AUDIO = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3]);
    const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
    const withMedia = (): AgentReply => {
      const media: ReplyMedia = { kind: "audio", ref: "0a05cfd1-7a02-4687-86d3-dbe8526cf836", mimeType: "audio/ogg; codecs=opus", sizeBytes: AUDIO.length, failureText: "Não consegui mandar o arquivo do áudio agora." };
      const citation = { index: 1, messageId: "6f1c8a52-1d3e-4a4b-9a0e-2b4f0c9d7e11", author: "Ana", sourceTitle: "T3", sentAt: "2026-11-12T13:00:00.000Z", kind: "audio" as const };
      return { text: "[1] Ana em T3, áudio de 0:07. Mando o áudio em seguida.", outcome: "answered", citations: [citation], media: [media] };
    };
    const allText = (driver: ChannelDriver) => driver.deliveredReplies().flatMap((r) => r.parts).join("\n");

    it("anexo (1.4.0): entrega o texto e depois o áudio pelo loader, com os mesmos bytes", async (ctx) => {
      const asked: string[] = [];
      const loadMedia: OutboundMediaLoader = async (destination, ref) => (asked.push(`${destination}|${ref}`), { bytes: AUDIO, mimeType: "audio/ogg; codecs=opus" });
      const { channel, driver } = await connected({ loadMedia });
      if (!channel.capabilities().supportsMedia || !driver.deliveredMedia) ctx.skip();
      const destination = driver.replyDestination ?? "destino-1";
      await channel.sendReply(destination, withMedia());
      expect(allText(driver)).toContain("Mando o áudio em seguida.");
      expect(allText(driver)).not.toContain("Não consegui mandar");
      expect(asked).toEqual([`${destination}|0a05cfd1-7a02-4687-86d3-dbe8526cf836`]);
      expect(driver.deliveredMedia?.()).toEqual([{ destinationAccountId: destination, sizeBytes: AUDIO.length, sha256: sha256(AUDIO) }]);
    });

    it("anexo (1.4.0): loader que falha entrega o texto de falha e nenhum áudio", async (ctx) => {
      const { channel, driver } = await connected({ loadMedia: async () => Promise.reject(new MediaUnavailableError("download_failed")) });
      if (!channel.capabilities().supportsMedia || !driver.deliveredMedia) ctx.skip();
      await channel.sendReply(driver.replyDestination ?? "destino-1", withMedia());
      expect(allText(driver)).toContain("Não consegui mandar o arquivo do áudio agora.");
      expect(driver.deliveredMedia?.()).toEqual([]);
    });

    it("anexo (1.4.0): sem loader, entrega o texto de falha; resposta sem anexo não entrega áudio", async (ctx) => {
      const { channel, driver } = await connected();
      if (!channel.capabilities().supportsMedia || !driver.deliveredMedia) ctx.skip();
      const destination = driver.replyDestination ?? "destino-1";
      await channel.sendReply(destination, withMedia());
      expect(allText(driver)).toContain("Não consegui mandar o arquivo do áudio agora.");
      await channel.sendReply(destination, { text: "sem anexo", outcome: "no_evidence", citations: [] });
      expect(driver.deliveredMedia?.()).toEqual([]);
    });

    it("encaminhado (009): chega marcado e válido; a mensagem digitada chega sem a marca", async (ctx) => {
      const { driver, toAgent } = await connected();
      if (!driver.simulateDirect) ctx.skip();
      await driver.simulateDirect?.({ id: "fw-1", text: "recomendo o Temporal", isForwarded: true });
      await driver.simulateDirect?.({ id: "typed-1", text: "digitado" });
      expect(toAgent.map((m) => [m.text, m.isForwarded])).toEqual([["recomendo o Temporal", true], ["digitado", false]]);
      expect(toAgent[1]).not.toHaveProperty("quotedExternalMessageId");
      for (const m of toAgent) expect(validateCanonicalMessage(m).ok).toBe(true);
    });

    it("citação (009): a resposta citando traz o id da mensagem citada", async (ctx) => {
      const { driver, toAgent } = await connected();
      if (!driver.simulateDirect) ctx.skip();
      await driver.simulateDirect?.({ id: "fw-2", text: "algo", isForwarded: true });
      await driver.simulateDirect?.({ id: "cmd-2", text: "guarda em decisões", quotedId: "fw-2" });
      expect(toAgent[1]?.quotedExternalMessageId).toBe(toAgent[0]?.source.externalMessageId);
    });

    it("legenda (009): foto com legenda chega como image com o texto e sem anexo", async (ctx) => {
      const { driver, toAgent } = await connected();
      if (!driver.simulateDirect) ctx.skip();
      await driver.simulateDirect?.({ id: "img-1", kind: "image", caption: "quadro da reunião", isForwarded: true });
      expect(toAgent[0]).toMatchObject({ kind: "image", text: "quadro da reunião", attachments: [] });
      expect(validateCanonicalMessage(toAgent[0]).ok).toBe(true);
    });

    it("áudio ao agente (009): chega com fetchRef e os bytes vêm pelo fetchMedia", async (ctx) => {
      const { channel, driver, toAgent } = await connected();
      if (!driver.simulateDirect || !channel.capabilities().supportsMedia) ctx.skip();
      const bytes = new Uint8Array([79, 103, 103, 83, 9]);
      await driver.simulateDirect?.({ id: "au-1", kind: "audio", audio: bytes, isForwarded: true });
      const attachment = toAgent[0]?.attachments[0];
      expect(toAgent[0]?.kind).toBe("audio");
      expect(attachment?.fetchRef).toBeTruthy();
      expect(validateCanonicalMessage(toAgent[0]).ok).toBe(true);
      const fetched = await channel.fetchMedia(attachment?.fetchRef ?? "");
      expect(createHash("sha256").update(fetched.bytes).digest("hex")).toBe(createHash("sha256").update(bytes).digest("hex"));
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
