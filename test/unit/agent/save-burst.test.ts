// Feature 009, demonstração de 2026-11-26: o WhatsApp não marca como encaminhada a mensagem que o próprio dono
// escreveu. Textos que chegam juntos viram uma leva que espera o "guarda em", e o "responder" guarda um texto comum
// recente, mesmo que ele tenha virado pergunta.
import { describe, expect, it } from "vitest";
import type { CanonicalMessage } from "../../../src/contracts/channel/knowledge-channel.js";
import { PENDING_TTL_MS } from "../../../src/modules/agent/application/pending-forwards.js";
import { createSaveContent, type SaveContext } from "../../../src/modules/agent/application/save-content.js";
import { SAVE_TEXT } from "../../../src/modules/agent/domain/saved-replies.js";
import { createMemoryPendingForwards } from "../../../src/modules/agent/infrastructure/memory-pending-forwards.js";
import { canonicalMessage } from "../../support/messages.js";

const ctx: SaveContext = { userId: "user-1", spaceId: "space-1", provider: "whatsapp", accountId: "5511999990000" };
const T0 = Date.parse("2026-11-26T09:54:00.000Z");

const text = (id: string, offsetMs: number, overrides: Partial<CanonicalMessage> = {}) =>
  canonicalMessage({
    source: { provider: "whatsapp", accountId: "agent", conversationId: "agent:dono", externalMessageId: id },
    timestamp: new Date(T0 + offsetMs).toISOString(),
    text: `anotação ${id}`,
    ...overrides,
  });
const ids = (messages: readonly CanonicalMessage[]) => messages.map((m) => m.source.externalMessageId ?? "");

function setup(windowMs = 2_000) {
  const saved: string[] = [];
  const events: string[] = [];
  let release: () => void = () => undefined;
  const pending = createMemoryPendingForwards<SaveContext>();
  const service = createSaveContent({
    pending,
    content: {
      async save({ message }) {
        saved.push(message.source.externalMessageId ?? "");
        return "saved";
      },
    },
    observer: { saved: () => undefined, forwarded: (o) => events.push(o) },
    burst: { windowMs, settleMs: 1_500, sleep: () => new Promise<void>((resolve) => (release = resolve)) },
  });
  return { service, pending, saved, events, settle: () => release() };
}

describe("leva de textos comuns na memória", () => {
  it("texto sozinho fica como comum; outro no mesmo segundo leva os dois para a espera", () => {
    const pending = createMemoryPendingForwards<string>();
    expect(pending.noteText("dono", "ctx", text("a", 0), 2_000)).toEqual({ batched: false, opened: false });
    expect(pending.isLoose("dono", "a")).toBe(true);
    expect(pending.noteText("dono", "ctx", text("b", 800), 2_000)).toEqual({ batched: true, opened: true });
    expect(pending.noteText("dono", "ctx", text("c", 1_500), 2_000)).toEqual({ batched: true, opened: false });
    expect(pending.isLoose("dono", "a")).toBe(false);
    expect(ids(pending.takeAll("dono"))).toEqual(["a", "b", "c"]);
  });

  it("textos distantes não formam leva; com a janela zerada, nunca", () => {
    const pending = createMemoryPendingForwards<string>();
    pending.noteText("dono", "ctx", text("a", 0), 2_000);
    expect(pending.noteText("dono", "ctx", text("b", 2_001), 2_000).batched).toBe(false);
    expect(pending.noteText("outro", "ctx", text("x", 0), 0).batched).toBe(false);
    expect(pending.noteText("outro", "ctx", text("y", 0), 0).batched).toBe(false);
  });

  it("texto comum junto de um encaminhado que espera entra na mesma leva, sem novo aviso", () => {
    const pending = createMemoryPendingForwards<string>();
    pending.add("dono", "ctx", text("f", 0, { isForwarded: true }));
    expect(pending.noteText("dono", "ctx", text("a", 500), 2_000)).toEqual({ batched: true, opened: false });
    expect(ids(pending.takeAll("dono"))).toEqual(["f", "a"]);
  });

  it("o texto comum pode ser citado por 10 minutos e some sem rastro", async () => {
    let t = 1_000_000;
    const pending = createMemoryPendingForwards<string>({ now: () => t });
    pending.noteText("dono", "ctx", text("a", 0), 2_000);
    pending.noteText("dono", "ctx", text("b", 60_000), 2_000);
    expect(pending.takeRecent("dono", "a")?.source.externalMessageId).toBe("a");
    expect(pending.isLoose("dono", "a")).toBe(false);
    expect(pending.takeRecent("dono", "a")?.source.externalMessageId).toBe("a");
    t += PENDING_TTL_MS;
    await pending.sweep();
    expect(pending.takeRecent("dono", "b")).toBeNull();
  });
});

describe("leva no agente", () => {
  it("o primeiro espera um instante; levado pela leva, não responde como pergunta", async () => {
    const { service, settle, events } = setup();
    const first = service.screen(ctx, text("a", 0));
    expect((await service.screen(ctx, text("b", 300)))?.text).toBe(SAVE_TEXT.received);
    expect(await service.screen(ctx, text("c", 600))).toBeNull();
    settle();
    expect(await first).toBeNull();
    expect(events).toEqual(["noticed", "queued"]);
  });

  it("sozinho, segue como pergunta depois da espera", async () => {
    const { service, settle } = setup();
    const alone = service.screen(ctx, text("a", 0));
    settle();
    expect(await alone).toBeUndefined();
  });

  it("sem a leva (canal de teste), segue como pergunta na hora", async () => {
    const { service } = setup(0);
    expect(await service.screen(ctx, text("a", 0))).toBeUndefined();
    expect(await service.screen(ctx, text("b", 0))).toBeUndefined();
  });

  it("guarda em X guarda a leva inteira", async () => {
    const { service, settle, saved } = setup();
    const first = service.screen(ctx, text("a", 0));
    await service.screen(ctx, text("b", 300));
    settle();
    await first;
    const reply = await service.run(ctx, { kind: "save", theme: "ideias" }, text("cmd", 5_000, { text: "guarda em ideias" }));
    expect(reply.text).toBe("Guardei 2 itens em ideias.");
    expect(saved).toEqual(["a", "b"]);
  });

  it("depois de guardada, a mensagem ainda pode ser citada para outro tema por 10 minutos", async () => {
    const { service, settle, saved } = setup();
    const first = service.screen(ctx, text("a", 0));
    await service.screen(ctx, text("b", 300));
    settle();
    await first;
    await service.run(ctx, { kind: "save", theme: "ideias" }, text("cmd", 5_000, { text: "guarda em ideias" }));
    const reply = await service.run(ctx, { kind: "save", theme: "decisões" }, text("cmd2", 120_000, { text: "guarda em decisões", quotedExternalMessageId: "b" }));
    expect(reply.text).toBe("Guardei em decisões.");
    expect(saved).toEqual(["a", "b", "b"]);
  });

  it("um encaminhado já guardado também pode ser citado depois", async () => {
    const { service, saved } = setup();
    service.hold(ctx, text("f", 0, { isForwarded: true }));
    await service.run(ctx, { kind: "save", theme: "ideias" }, text("cmd", 5_000, { text: "guarda em ideias" }));
    expect((await service.run(ctx, { kind: "save", theme: "decisões" }, text("cmd2", 60_000, { text: "guarda em decisões", quotedExternalMessageId: "f" }))).text).toBe("Guardei em decisões.");
    expect(saved).toEqual(["f", "f"]);
  });

  it("depois dos 10 minutos, a citada é procurada entre os guardados e copiada para o tema novo", async () => {
    const asked: string[] = [];
    const saved: string[] = [];
    const service = createSaveContent({
      pending: createMemoryPendingForwards<SaveContext>(),
      content: {
        async save({ theme, message }) {
          saved.push(`${theme}:${message.source.externalMessageId}:${message.text}`);
          return "saved";
        },
        async findSaved(_context, id, request) {
          asked.push(id);
          return id === "velha" ? { ...request, source: { ...request.source, externalMessageId: "velha" }, text: "link guardado" } : null;
        },
      },
    });
    const reply = await service.run(ctx, { kind: "save", theme: "decisões" }, text("cmd", 0, { text: "guarda em decisões", quotedExternalMessageId: "velha" }));
    expect(reply.text).toBe("Guardei em decisões.");
    expect(saved).toEqual(["decisões:velha:link guardado"]);
    expect((await service.run(ctx, { kind: "save", theme: "x" }, text("cmd", 0, { text: "guarda em x", quotedExternalMessageId: "nunca" }))).text).toBe(SAVE_TEXT.quotedNotFound);
    expect(asked).toEqual(["velha", "nunca"]);
  });

  it("responder citando um texto que virou pergunta guarda esse texto", async () => {
    const { service, settle, saved } = setup();
    const alone = service.screen(ctx, text("a", 0));
    settle();
    await alone;
    const reply = await service.run(ctx, { kind: "save", theme: "ideias" }, text("cmd", 30_000, { text: "guarda em ideias", quotedExternalMessageId: "a" }));
    expect(reply.text).toBe("Guardei em ideias.");
    expect(saved).toEqual(["a"]);
  });
});
