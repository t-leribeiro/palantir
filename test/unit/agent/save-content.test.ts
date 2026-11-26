// T012 (feature 009, D-07, D-14, RN-11): o que o agente guarda e como responde, com dublê da gravação.
import { describe, expect, it } from "vitest";
import type { CanonicalMessage } from "../../../src/contracts/channel/knowledge-channel.js";
import { classify, createSaveContent, type SaveContentPort, type SaveContext } from "../../../src/modules/agent/application/save-content.js";
import { SAVE_TEXT } from "../../../src/modules/agent/domain/saved-replies.js";
import { createMemoryPendingForwards } from "../../../src/modules/agent/infrastructure/memory-pending-forwards.js";
import { canonicalMessage, withoutText } from "../../support/messages.js";

const ctx: SaveContext = { userId: "user-1", spaceId: "space-1", provider: "fake", accountId: "fake-operator" };

const forwarded = (id: string, overrides: Partial<CanonicalMessage> = {}) =>
  canonicalMessage({ source: { provider: "fake", accountId: "agent", conversationId: "agent:dono", externalMessageId: id }, isForwarded: true, text: `texto ${id}`, ...overrides });
const command = (text: string, overrides: Partial<CanonicalMessage> = {}) =>
  canonicalMessage({ source: { provider: "fake", accountId: "agent", conversationId: "agent:dono", externalMessageId: "cmd" }, text, ...overrides });

function setup(outcome: Awaited<ReturnType<SaveContentPort["save"]>> | ((m: CanonicalMessage) => Awaited<ReturnType<SaveContentPort["save"]>>) = "saved") {
  const saved: { theme: string; id: string | undefined; text: string | undefined }[] = [];
  const events: string[] = [];
  const pending = createMemoryPendingForwards<SaveContext>();
  const service = createSaveContent({
    pending,
    content: {
      async save({ theme, message }) {
        saved.push({ theme, id: message.source.externalMessageId, text: message.text });
        return typeof outcome === "function" ? outcome(message) : outcome;
      },
    },
    observer: { saved: (o, k) => events.push(k ? `${o}:${k}` : o), forwarded: (o, n) => events.push(n ? `${o}:${n}` : o) },
  });
  return { service, saved, events, pending };
}

describe("o que espera o pedido", () => {
  it("só o primeiro da leva recebe o aviso", () => {
    const { service, events } = setup();
    expect(service.hold(ctx, forwarded("a"))?.text).toBe(SAVE_TEXT.received);
    expect(service.hold(ctx, forwarded("b"))).toBeNull();
    expect(events).toEqual(["noticed", "queued"]);
  });
});

describe("guardar", () => {
  it("sem citar, guarda tudo o que espera, na ordem", async () => {
    const { service, saved } = setup();
    service.hold(ctx, forwarded("a"));
    service.hold(ctx, forwarded("b"));
    const reply = await service.run(ctx, { kind: "save", theme: "Decisões" }, command("guarda em Decisões"));
    expect(reply.text).toBe("Guardei 2 itens em Decisões.");
    expect(saved.map((s) => [s.theme, s.id])).toEqual([["Decisões", "a"], ["Decisões", "b"]]);
  });

  it("citando, guarda só a citada e deixa as outras esperando", async () => {
    const { service, saved } = setup();
    for (const id of ["a", "b", "c"]) service.hold(ctx, forwarded(id));
    await service.run(ctx, { kind: "save", theme: "decisões" }, command("guarda em decisões", { quotedExternalMessageId: "b" }));
    expect(saved.map((s) => s.id)).toEqual(["b"]);
    await service.run(ctx, { kind: "save", theme: "rascunho" }, command("guarda em rascunho"));
    expect(saved.map((s) => [s.theme, s.id])).toEqual([["decisões", "b"], ["rascunho", "a"], ["rascunho", "c"]]);
  });

  it("citação que não espera mais e nada esperando têm respostas próprias", async () => {
    const { service, events } = setup();
    expect((await service.run(ctx, { kind: "save", theme: "x" }, command("guarda em x", { quotedExternalMessageId: "velha" }))).text).toBe(SAVE_TEXT.quotedNotFound);
    expect((await service.run(ctx, { kind: "save", theme: "x" }, command("guarda em x"))).text).toBe(SAVE_TEXT.nothingToSave);
    expect(events).toEqual(["not_found", "nothing_pending"]);
  });

  it("numa mensagem só, guarda o texto depois do dois-pontos e não mexe no que espera", async () => {
    const { service, saved } = setup();
    service.hold(ctx, forwarded("a"));
    const reply = await service.run(ctx, { kind: "save", theme: "leituras", content: "https://exemplo.com filas" }, command("guarda em leituras: https://exemplo.com filas"));
    expect(reply.text).toBe("Guardei em leituras.");
    expect(saved).toEqual([{ theme: "leituras", id: "cmd", text: "https://exemplo.com filas" }]);
    expect((await service.run(ctx, { kind: "save", theme: "x" }, command("guarda em x"))).text).toBe("Guardei em x.");
  });

  it("tema longo demais é recusado sem consumir a espera", async () => {
    const { service, saved } = setup();
    service.hold(ctx, forwarded("a"));
    expect((await service.run(ctx, { kind: "save", theme: "x".repeat(61) }, command("guarda em ..."))).text).toBe(SAVE_TEXT.themeTooLong);
    expect(saved).toEqual([]);
    expect((await service.run(ctx, { kind: "save", theme: "ok" }, command("guarda em ok"))).text).toBe("Guardei em ok.");
  });

  it("aceita texto, áudio e legenda; foto sem legenda e tipo desconhecido não vão para a gravação", async () => {
    const { service, saved, events } = setup();
    service.hold(ctx, forwarded("texto"));
    service.hold(ctx, withoutText(forwarded("audio", { kind: "audio" })));
    service.hold(ctx, forwarded("foto", { kind: "image", text: "legenda da foto" }));
    service.hold(ctx, withoutText(forwarded("foto-sem", { kind: "image" })));
    const reply = await service.run(ctx, { kind: "save", theme: "viagens" }, command("guarda em viagens"));
    expect(saved.map((s) => s.id)).toEqual(["texto", "audio", "foto"]);
    expect(reply.text).toBe("Guardei 3 itens em viagens.\n1 sem legenda ficou de fora: de foto, vídeo e documento eu só guardo a legenda.");
    expect(events).toContain("saved:audio");
    expect(events).toContain("saved:caption");
    expect(events).toContain("no_caption");
  });

  it("junta duplicata, áudio sem armazenamento e falha na mesma resposta", async () => {
    const { service } = setup((m) => (m.source.externalMessageId === "a" ? "duplicate" : m.source.externalMessageId === "b" ? "media_off" : "saved"));
    for (const id of ["a", "b", "c"]) service.hold(ctx, forwarded(id));
    const reply = await service.run(ctx, { kind: "save", theme: "t" }, command("guarda em t"));
    expect(reply.text).toBe("Guardei em t; 1 já estava guardado.\nNão consigo guardar áudio agora: o armazenamento de mídia não está ligado.");
  });

  it("guarda até 20 por vez e avisa o resto", async () => {
    const { service, saved } = setup();
    for (let i = 0; i < 23; i += 1) service.hold(ctx, forwarded(`m${i}`));
    const reply = await service.run(ctx, { kind: "save", theme: "t" }, command("guarda em t"));
    expect(saved).toHaveLength(20);
    expect(reply.text).toBe("Guardei 20 itens em t.\nOutros 3 passaram do limite de 20 por vez.");
  });

  it("erro na gravação vira falha, sem derrubar a resposta", async () => {
    const pending = createMemoryPendingForwards<SaveContext>();
    const service = createSaveContent({
      pending,
      content: {
        async save() {
          throw new Error("banco fora");
        },
      },
    });
    service.hold(ctx, forwarded("a"));
    expect((await service.run(ctx, { kind: "save", theme: "t" }, command("guarda em t"))).text).toBe(SAVE_TEXT.failed("t"));
  });
});

describe("guardar sem tema", () => {
  it("pede o tema e a próxima resposta guarda tudo com ele", async () => {
    const { service, saved } = setup();
    service.hold(ctx, forwarded("a"));
    expect((await service.run(ctx, { kind: "ask_theme" }, command("guarda isso"))).text).toBe(SAVE_TEXT.askTheme);
    expect(service.awaitingTheme(ctx)).toBe(true);
    expect((await service.answerTheme(ctx, "Arquitetura", command("Arquitetura"))).text).toBe("Guardei em Arquitetura.");
    expect(saved.map((s) => [s.theme, s.id])).toEqual([["Arquitetura", "a"]]);
    expect(service.awaitingTheme(ctx)).toBe(false);
  });

  it("sem nada esperando, não pede tema", async () => {
    const { service } = setup();
    expect((await service.run(ctx, { kind: "ask_theme" }, command("guarda isso"))).text).toBe(SAVE_TEXT.nothingToSave);
  });

  it("a varredura guarda em 'sem tema' e o aviso vem uma vez", async () => {
    const { service, saved } = setup();
    expect(await service.untitled(ctx, [forwarded("a"), forwarded("b")])).toBe(2);
    expect(saved.map((s) => s.theme)).toEqual(["sem tema", "sem tema"]);
  });
});

describe("tipo aceito", () => {
  it("classifica pelo tipo e pela legenda", () => {
    expect(classify(canonicalMessage({ kind: "link", text: "https://x" }))).toBe("text");
    expect(classify(withoutText(canonicalMessage({ kind: "document" })))).toBe("no_caption");
    expect(classify(canonicalMessage({ kind: "document", text: "contrato" }))).toBe("caption");
  });
});

describe("nome do tema (RN-03)", () => {
  it("a resposta usa o nome gravado na primeira vez, que a gravação devolve", async () => {
    const pending = createMemoryPendingForwards<SaveContext>();
    const service = createSaveContent({ pending, content: { save: async () => ({ outcome: "duplicate", theme: "Arquitetura" }) } });
    service.hold(ctx, forwarded("a"));
    expect((await service.run(ctx, { kind: "save", theme: "arquitetura" }, command("guarda em arquitetura"))).text).toBe("Isso já estava guardado em Arquitetura.");
  });
});
