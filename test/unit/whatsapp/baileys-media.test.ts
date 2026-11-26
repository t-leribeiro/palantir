// T015 (feature 005, D-18): áudio de grupo anunciado pelo provedor real e baixado só sob demanda.
import type { EventEmitter } from "node:events";
import type * as Baileys from "baileys";
import { describe, expect, it, vi } from "vitest";
import { MediaUnavailableError } from "../../../src/contracts/channel/knowledge-channel.js";
import { mediaInfoOf } from "../../../src/channels/whatsapp/provider/mapping.js";
import type { IncomingDirect, IncomingGroupMessage } from "../../../src/channels/whatsapp/provider/provider.js";
import { createRecentMedia } from "../../../src/channels/whatsapp/provider/recent-media.js";
import type { EncryptedFileStore } from "../../../src/channels/whatsapp/session/encrypted-file-store.js";

interface FakeSocket {
  readonly ev: EventEmitter;
  readonly end: ReturnType<typeof vi.fn>;
  readonly updateMediaMessage: ReturnType<typeof vi.fn>;
  readonly groupFetchAllParticipating: ReturnType<typeof vi.fn>;
  readonly signalRepository: { lidMapping: { getPNForLID: ReturnType<typeof vi.fn> } };
}

const sockets = vi.hoisted(() => [] as FakeSocket[]);
const download = vi.hoisted(() => ({ calls: [] as unknown[], fail: false }));

vi.mock("baileys", async (importOriginal) => {
  const actual = await importOriginal<typeof Baileys>();
  const { EventEmitter: Emitter } = await import("node:events");
  return {
    ...actual,
    makeCacheableSignalKeyStore: (keys: unknown) => keys,
    downloadMediaMessage: async (message: unknown) => {
      download.calls.push(message);
      if (download.fail) throw new Error("mídia expirada no servidor");
      return Buffer.from("OggS-bytes");
    },
    default: () => {
      const socket: FakeSocket = {
        ev: new Emitter(),
        end: vi.fn(),
        updateMediaMessage: vi.fn(),
        groupFetchAllParticipating: vi.fn(async () => ({})),
        signalRepository: { lidMapping: { getPNForLID: vi.fn(async () => null) } },
      };
      sockets.push(socket);
      return socket;
    },
  };
});

const { createBaileysProvider } = await import("../../../src/channels/whatsapp/provider/baileys-provider.js");

const store: EncryptedFileStore = { load: async () => null, save: () => undefined, flush: async () => undefined, remove: async () => undefined };
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const GROUP = "120363000000000001@g.us";

const audioMessage = (id: string) => ({
  key: { remoteJid: GROUP, id, fromMe: false, participant: "5511988887777@s.whatsapp.net" },
  message: { audioMessage: { mimetype: "audio/ogg; codecs=opus", seconds: 42, fileLength: 6800, ptt: true } },
  messageTimestamp: 1_795_000_000,
  pushName: "Ana Souza",
});

async function started() {
  const provider = createBaileysProvider({ store, log, acceptGroups: true });
  const received: IncomingGroupMessage[] = [];
  provider.onGroupMessage(async (m) => void received.push(m));
  await provider.start();
  const socket = sockets.at(-1) as FakeSocket;
  const upsert = async (messages: unknown[]) => {
    socket.ev.emit("messages.upsert", { messages, type: "notify" });
    await vi.waitFor(() => undefined);
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { provider, received, upsert };
}

describe("provedor Baileys: mídia de grupo", () => {
  it("anuncia o áudio com MIME, duração, tamanho e referência, sem baixar nada", async () => {
    download.calls.length = 0;
    const { received, upsert } = await started();
    await upsert([audioMessage("A1")]);
    expect(received[0]).toMatchObject({ kind: "audio", media: { mimeType: "audio/ogg; codecs=opus", seconds: 42, sizeBytes: 6800, fetchRef: "A1" } });
    expect(download.calls).toHaveLength(0);
  });

  it("baixa sob demanda pela referência; referência desconhecida é expired; falha da biblioteca é download_failed", async () => {
    download.calls.length = 0;
    const { provider, upsert } = await started();
    await upsert([audioMessage("A2")]);
    expect(Buffer.from(await provider.downloadMedia("A2")).toString()).toBe("OggS-bytes");
    expect(download.calls).toHaveLength(1);
    await expect(provider.downloadMedia("nao-existe")).rejects.toEqual(new MediaUnavailableError("expired"));
    download.fail = true;
    await expect(provider.downloadMedia("A2")).rejects.toMatchObject({ reason: "download_failed" });
    download.fail = false;
  });

  it("texto de grupo não tem mídia", async () => {
    const { received, upsert } = await started();
    await upsert([{ ...audioMessage("T1"), message: { conversation: "oi" } }]);
    expect(received[0]).not.toHaveProperty("media");
  });
});

describe("mediaInfoOf", () => {
  it("lê os campos de cada tipo; Long do protobuf vira número; sem MIME fica genérico", () => {
    expect(mediaInfoOf({ audioMessage: { mimetype: "audio/ogg; codecs=opus", seconds: 3, fileLength: { valueOf: () => 1200 } } })).toEqual({
      mimeType: "audio/ogg; codecs=opus",
      seconds: 3,
      sizeBytes: 1200,
    });
    expect(mediaInfoOf({ imageMessage: { mimetype: "image/jpeg" } })).toEqual({ mimeType: "image/jpeg" });
    expect(mediaInfoOf({ documentMessage: {} })).toEqual({ mimeType: "application/octet-stream" });
    expect(mediaInfoOf({ conversation: "oi" })).toBeUndefined();
    expect(mediaInfoOf(undefined)).toBeUndefined();
    expect(mediaInfoOf({ audioMessage: { mimetype: "audio/ogg", seconds: -1 } })).toEqual({ mimeType: "audio/ogg" });
  });
});

describe("createRecentMedia", () => {
  it("guarda por pouco tempo e com limite de quantidade", () => {
    let now = 0;
    const recent = createRecentMedia<string>({ limit: 2, ttlMs: 1000, now: () => now });
    recent.remember("a", "A");
    recent.remember("b", "B");
    recent.remember("c", "C");
    expect(recent.take("a")).toBeUndefined();
    expect(recent.take("b")).toBe("B");
    expect(recent.size).toBe(2);
    now = 1001;
    expect(recent.take("c")).toBeUndefined();
    expect(recent.size).toBe(1);
  });

  it("lembrar de novo a mesma referência renova o prazo e a posição", () => {
    let now = 0;
    const recent = createRecentMedia<string>({ limit: 2, ttlMs: 1000, now: () => now });
    recent.remember("a", "A");
    recent.remember("b", "B");
    now = 900;
    recent.remember("a", "A2");
    recent.remember("c", "C");
    now = 1500;
    expect(recent.take("a")).toBe("A2");
    expect(recent.take("b")).toBeUndefined();
  });
});

describe("provedor Baileys: mensagem direta (feature 009, D-02)", () => {
  const DIRECT = "5511999990000@s.whatsapp.net";
  const direct = (id: string, message: Record<string, unknown>) => ({
    key: { remoteJid: DIRECT, id, fromMe: false },
    message,
    messageTimestamp: 1_795_000_000,
    pushName: "Dono",
  });

  async function startedDirect() {
    const provider = createBaileysProvider({ store, log });
    const received: IncomingDirect[] = [];
    provider.onDirectMessage(async (m) => void received.push(m));
    await provider.start();
    const socket = sockets.at(-1) as FakeSocket;
    const upsert = async (messages: unknown[]) => {
      socket.ev.emit("messages.upsert", { messages, type: "notify" });
      await vi.waitFor(() => undefined);
      await new Promise((resolve) => setImmediate(resolve));
    };
    return { provider, received, upsert };
  }

  it("marca o encaminhado e a citada pelo contextInfo; texto puro chega como não encaminhado", async () => {
    const { received, upsert } = await startedDirect();
    await upsert([
      direct("F1", { extendedTextMessage: { text: "recomendo o Temporal", contextInfo: { isForwarded: true, forwardingScore: 1 } } }),
      direct("Q1", { extendedTextMessage: { text: "guarda em decisões", contextInfo: { stanzaId: "F1", quotedMessage: { conversation: "x" } } } }),
      direct("P1", { conversation: "oi" }),
    ]);
    expect(received[0]).toMatchObject({ id: "F1", kind: "text", text: "recomendo o Temporal", isForwarded: true });
    expect(received[1]).toMatchObject({ id: "Q1", quotedId: "F1" });
    expect(received[1]).not.toHaveProperty("isForwarded");
    expect(received[2]).not.toHaveProperty("isForwarded");
  });

  it("anuncia o áudio direto para o guardar, sem baixar, e lê a legenda de foto e documento", async () => {
    download.calls.length = 0;
    const { provider, received, upsert } = await startedDirect();
    await upsert([
      direct("A9", { audioMessage: { mimetype: "audio/ogg; codecs=opus", seconds: 42, fileLength: 6800, ptt: true, contextInfo: { isForwarded: true } } }),
      direct("I1", { imageMessage: { mimetype: "image/jpeg", caption: "quadro da reunião" } }),
      direct("D1", { documentWithCaptionMessage: { message: { documentMessage: { mimetype: "application/pdf", caption: "contrato", contextInfo: { isForwarded: true } } } } }),
    ]);
    expect(received[0]).toMatchObject({ kind: "audio", isForwarded: true, media: { seconds: 42, sizeBytes: 6800, fetchRef: "A9" } });
    expect(download.calls).toHaveLength(0);
    expect(received[1]).toMatchObject({ kind: "image", caption: "quadro da reunião" });
    expect(received[1]).not.toHaveProperty("media");
    expect(received[2]).toMatchObject({ kind: "document", caption: "contrato", isForwarded: true });
    expect(Buffer.from(await provider.downloadMedia("A9")).toString()).toBe("OggS-bytes");
  });
});
