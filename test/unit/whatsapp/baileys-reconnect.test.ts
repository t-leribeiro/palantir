// Demonstração manual da S2: logo depois de ler o QR, o WhatsApp pede reinício (515). A reconexão precisa
// usar as credenciais recém-pareadas em memória, não o arquivo (ainda sem a gravação agrupada); e, depois de
// um logout (401), escritas tardias da biblioteca não podem recriar o arquivo da sessão morta.
import type { EventEmitter } from "node:events";
import type * as Baileys from "baileys";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EncryptedFileStore } from "../../../src/channels/whatsapp/session/encrypted-file-store.js";

interface FakeSocket {
  readonly config: { auth: { creds: { me?: { id: string } }; keys: { set(data: object): unknown } } };
  readonly ev: EventEmitter;
  readonly end: ReturnType<typeof vi.fn>;
}

const sockets = vi.hoisted(() => [] as FakeSocket[]);

vi.mock("baileys", async (importOriginal) => {
  const actual = await importOriginal<typeof Baileys>();
  const { EventEmitter: Emitter } = await import("node:events");
  return {
    ...actual,
    makeCacheableSignalKeyStore: (keys: unknown) => keys,
    default: (config: FakeSocket["config"]) => {
      const socket: FakeSocket = { config, ev: new Emitter(), end: vi.fn() };
      sockets.push(socket);
      return socket;
    },
  };
});

const { createBaileysProvider } = await import("../../../src/channels/whatsapp/provider/baileys-provider.js");

/** Store que só grava no `flush`, como a gravação agrupada real logo depois do pareamento. */
function delayedStore(): EncryptedFileStore & { saved: () => string | null; removed: () => number } {
  let text: string | null = null;
  let pending: string | undefined;
  let removals = 0;
  return {
    load: async () => text,
    save: (value) => void (pending = value),
    flush: async () => {
      if (pending !== undefined) text = pending;
      pending = undefined;
    },
    remove: async () => {
      removals += 1;
      text = null;
      pending = undefined;
    },
    saved: () => text,
    removed: () => removals,
  };
}

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const close = (socket: FakeSocket, statusCode: number) =>
  socket.ev.emit("connection.update", { connection: "close", lastDisconnect: { error: { output: { statusCode } } } });

beforeEach(() => {
  sockets.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createBaileysProvider: reconexão e logout", () => {
  it("reinício pedido logo após o pareamento reconecta com as credenciais pareadas", async () => {
    const store = delayedStore();
    const provider = createBaileysProvider({ store, log });
    await provider.start();
    const first = sockets[0] as FakeSocket;
    first.config.auth.creds.me = { id: "5519900000000:1@s.whatsapp.net" };
    first.ev.emit("creds.update", {});

    close(first, 515);
    await vi.runOnlyPendingTimersAsync();

    expect(sockets).toHaveLength(2);
    expect((sockets[1] as FakeSocket).config.auth.creds.me?.id).toBe("5519900000000:1@s.whatsapp.net");
    expect((sockets[1] as FakeSocket).config.auth.creds).toBe(first.config.auth.creds);
  });

  it("logout apaga a sessão, encerra o socket e ignora escritas tardias da biblioteca", async () => {
    const store = delayedStore();
    const provider = createBaileysProvider({ store, log });
    const states: string[] = [];
    provider.onState((state) => states.push(state));
    await provider.start();
    const socket = sockets[0] as FakeSocket;

    close(socket, 401);
    await vi.runOnlyPendingTimersAsync();
    await socket.config.auth.keys.set({ "pre-key": { 1: { public: new Uint8Array([1]), private: new Uint8Array([2]) } } });
    socket.ev.emit("creds.update", {});
    await store.flush();

    expect(states).toContain("logged_out");
    expect(store.removed()).toBe(1);
    expect(socket.end).toHaveBeenCalled();
    expect(store.saved()).toBeNull();
    expect(sockets).toHaveLength(1);
  });
});
