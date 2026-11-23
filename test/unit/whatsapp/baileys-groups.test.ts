// T009 (feature 004, D-03, D-07, D-11, D-15): provedor real com grupos, com a biblioteca simulada.
import type { EventEmitter } from "node:events";
import type * as Baileys from "baileys";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupInfo, IncomingDirect, IncomingGroupMessage } from "../../../src/channels/whatsapp/provider/provider.js";
import type { EncryptedFileStore } from "../../../src/channels/whatsapp/session/encrypted-file-store.js";

interface FakeSocket {
  readonly config: { shouldIgnoreJid: (jid: string) => boolean };
  readonly ev: EventEmitter;
  readonly end: ReturnType<typeof vi.fn>;
  readonly sendMessage: ReturnType<typeof vi.fn>;
  readonly groupFetchAllParticipating: ReturnType<typeof vi.fn>;
  readonly signalRepository: { lidMapping: { getPNForLID: ReturnType<typeof vi.fn> } };
}

const sockets = vi.hoisted(() => [] as FakeSocket[]);

vi.mock("baileys", async (importOriginal) => {
  const actual = await importOriginal<typeof Baileys>();
  const { EventEmitter: Emitter } = await import("node:events");
  return {
    ...actual,
    makeCacheableSignalKeyStore: (keys: unknown) => keys,
    default: (config: FakeSocket["config"]) => {
      const socket: FakeSocket = {
        config,
        ev: new Emitter(),
        end: vi.fn(),
        sendMessage: vi.fn(async () => undefined),
        groupFetchAllParticipating: vi.fn(async () => ({
          "120363000000000001@g.us": { id: "120363000000000001@g.us", subject: "Grupo de teste", size: 5, participants: [] },
          "120363000000000002@g.us": { id: "120363000000000002@g.us", subject: "Família", participants: [{ id: "a" }, { id: "b" }] },
        })),
        signalRepository: { lidMapping: { getPNForLID: vi.fn(async (lid: string) => (lid === "111111111111111@lid" ? "5511977776666@s.whatsapp.net" : null)) } },
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

function groupMessage(key: Record<string, unknown>, message: Record<string, unknown> = { conversation: "recomendo o Tempo" }) {
  return { key: { remoteJid: GROUP, id: `M-${Math.random()}`, fromMe: false, ...key }, message, messageTimestamp: 1_795_000_000, pushName: "Ana Souza" };
}

async function started(acceptGroups: boolean) {
  const provider = createBaileysProvider({ store, log, acceptGroups });
  const groupMessages: IncomingGroupMessage[] = [];
  const directs: IncomingDirect[] = [];
  const groupEvents: [GroupInfo[], boolean][] = [];
  provider.onGroupMessage(async (m) => void groupMessages.push(m));
  provider.onDirectMessage(async (m) => void directs.push(m));
  provider.onGroupsChanged((groups, complete) => groupEvents.push([[...groups], complete]));
  await provider.start();
  const socket = sockets.at(-1) as FakeSocket;
  const upsert = async (messages: unknown[]) => {
    socket.ev.emit("messages.upsert", { messages, type: "notify" });
    await vi.waitFor(() => undefined);
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { provider, socket, groupMessages, directs, groupEvents, upsert };
}

beforeEach(() => {
  sockets.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("provedor real: filtro de JID", () => {
  it("sem captura, grupos são ignorados já no socket; com captura, só transmissões e canais", async () => {
    const off = (await started(false)).socket;
    expect(off.config.shouldIgnoreJid(GROUP)).toBe(true);
    const on = (await started(true)).socket;
    expect(on.config.shouldIgnoreJid(GROUP)).toBe(false);
    expect(on.config.shouldIgnoreJid("status@broadcast")).toBe(true);
  });
});

describe("provedor real: mensagens de grupo", () => {
  it("entrega texto de grupo com autor em E.164, nome de perfil e horário", async () => {
    const { groupMessages, upsert } = await started(true);
    await upsert([groupMessage({ participant: "5511988887777@s.whatsapp.net", id: "G-1" })]);
    expect(groupMessages).toEqual([
      { id: "G-1", groupId: GROUP, senderPhone: "+5511988887777", senderName: "Ana Souza", kind: "text", text: "recomendo o Tempo", sentAt: new Date(1_795_000_000_000) },
    ]);
  });

  it("autor por LID: usa participantAlt, depois o mapeamento; sem número, fica o lid", async () => {
    const { groupMessages, upsert } = await started(true);
    await upsert([
      groupMessage({ participant: "222222222222222@lid", participantAlt: "5511955554444@s.whatsapp.net" }),
      groupMessage({ participant: "111111111111111@lid" }),
      groupMessage({ participant: "333333333333333@lid" }),
    ]);
    expect(groupMessages.map((m) => [m.senderPhone, m.senderLid])).toEqual([
      ["+5511955554444", undefined],
      ["+5511977776666", undefined],
      [null, "lid:333333333333333"],
    ]);
  });

  it("mídia chega com o tipo e sem texto; reação, mensagem própria e grupo sem captura não chegam", async () => {
    const { groupMessages, upsert } = await started(true);
    await upsert([
      groupMessage({ participant: "5511988887777@s.whatsapp.net" }, { audioMessage: { seconds: 3 } }),
      groupMessage({ participant: "5511988887777@s.whatsapp.net" }, { reactionMessage: { text: "👍" } }),
      groupMessage({ participant: "5511988887777@s.whatsapp.net", fromMe: true }),
    ]);
    expect(groupMessages.map((m) => [m.kind, m.text])).toEqual([["audio", undefined]]);
  });

  it("sem captura, mensagem de grupo não chega e a direta continua chegando", async () => {
    const { groupMessages, directs, upsert } = await started(false);
    await upsert([
      groupMessage({ participant: "5511988887777@s.whatsapp.net" }),
      { key: { remoteJid: "5511988887777@s.whatsapp.net", id: "D-1", fromMe: false }, message: { conversation: "oi" }, messageTimestamp: 1_795_000_000 },
    ]);
    expect(groupMessages).toEqual([]);
    expect(directs.map((d) => d.id)).toEqual(["D-1"]);
  });
});

describe("provedor real: diretório de grupos", () => {
  it("ao conectar, publica a lista completa com a quantidade de participantes", async () => {
    const { socket, groupEvents } = await started(true);
    socket.ev.emit("connection.update", { connection: "open" });
    await vi.waitFor(() => expect(groupEvents).toHaveLength(1));
    expect(groupEvents[0]).toEqual([
      [
        { groupId: GROUP, subject: "Grupo de teste", participants: 5 },
        { groupId: "120363000000000002@g.us", subject: "Família", participants: 2 },
      ],
      true,
    ]);
  });

  it("grupo novo é parcial; entrada ou saída de participante refaz a lista; promoção não", async () => {
    const { socket, groupEvents } = await started(true);
    socket.ev.emit("groups.upsert", [{ id: "9@g.us", subject: "Novo", participants: [{ id: "x" }] }]);
    expect(groupEvents).toEqual([[[{ groupId: "9@g.us", subject: "Novo", participants: 1 }], false]]);
    socket.ev.emit("group-participants.update", { id: GROUP, author: "x", participants: [], action: "promote" });
    socket.ev.emit("group-participants.update", { id: GROUP, author: "x", participants: [], action: "remove" });
    await vi.waitFor(() => expect(groupEvents).toHaveLength(2));
    expect(socket.groupFetchAllParticipating).toHaveBeenCalledTimes(1);
  });

  it("sem captura, não consulta grupos ao conectar", async () => {
    const { socket, groupEvents } = await started(false);
    socket.ev.emit("connection.update", { connection: "open" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(socket.groupFetchAllParticipating).not.toHaveBeenCalled();
    expect(groupEvents).toEqual([]);
  });

  it("falha ao buscar a lista vira aviso sem conteúdo, sem derrubar nada", async () => {
    const { socket } = await started(true);
    socket.groupFetchAllParticipating.mockRejectedValueOnce(new Error("timeout"));
    socket.ev.emit("connection.update", { connection: "open" });
    await vi.waitFor(() => expect(log.warn).toHaveBeenCalledWith("não foi possível atualizar a lista de grupos"));
  });

  it("listGroups consulta a lista atual", async () => {
    const { provider } = await started(true);
    expect((await provider.listGroups()).map((g) => g.subject)).toEqual(["Grupo de teste", "Família"]);
  });
});

describe("provedor real: nunca escreve em grupo (D-15)", () => {
  it("recusa enviar a grupo sem chamar a biblioteca", async () => {
    const { provider, socket } = await started(true);
    await expect(provider.sendText(GROUP, "oi")).rejects.toThrow("envio a grupo bloqueado");
    expect(socket.sendMessage).not.toHaveBeenCalled();
    await provider.sendText("5511988887777@s.whatsapp.net", "oi");
    expect(socket.sendMessage).toHaveBeenCalledTimes(1);
  });
});
