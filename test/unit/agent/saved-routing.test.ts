// T013 e T014 (feature 009, D-04, D-12 a D-14): o roteamento do guardar, listar e esquecer dentro do agente.
import { describe, expect, it } from "vitest";
import type { CanonicalMessage } from "../../../src/contracts/channel/knowledge-channel.js";
import { createSaveContent, type SaveContentPort, type SaveContext } from "../../../src/modules/agent/application/save-content.js";
import { createSavedListing } from "../../../src/modules/agent/application/saved-listing.js";
import { SAVE_TEXT } from "../../../src/modules/agent/domain/saved-replies.js";
import { createMemoryPendingForwards } from "../../../src/modules/agent/infrastructure/memory-pending-forwards.js";
import {
  MANAGEMENT_TEXT,
  createAskQuestion,
  createDeterministicAnswerGenerator,
  createManageSources,
  type CitationStore,
  type ConversationStateStore,
  type StoredCitations,
  type StoredPending,
} from "../../../src/modules/agent/index.js";
import type { SavedEntry, ThemeListing } from "../../../src/modules/knowledge/index.js";
import { canonicalMessage, withoutText } from "../../support/messages.js";

function memoryState(): ConversationStateStore & CitationStore {
  let pending: StoredPending | null = null;
  let citations: StoredCitations | null = null;
  return {
    listing: async () => null,
    saveListing: async () => undefined,
    pending: async () => pending,
    savePending: async (_u, _p, p) => {
      pending = p;
    },
    async takePending(_u, _p, ref, now) {
      if (!pending || pending.pending.ref !== ref || pending.expiresAt.getTime() <= now.getTime()) return false;
      pending = null;
      return true;
    },
    clearPending: async () => {
      pending = null;
    },
    citations: async () => citations,
    saveCitations: async (_u, _p, c) => {
      citations = c;
    },
  };
}

const ENTRY: SavedEntry = { itemId: "item-1", messageId: "msg-saved-1", kind: "text", text: "o Temporal resolveu", savedAt: new Date("2026-11-25T17:02:00Z") };

function setup(opts: { saved?: boolean } = {}) {
  const searches: string[] = [];
  const stored: { theme: string; id: string | undefined }[] = [];
  const forgotten: string[] = [];
  const managed: string[] = [];
  const state = memoryState();
  const pending = createMemoryPendingForwards<SaveContext>();
  const content: SaveContentPort = {
    async save({ theme, message }) {
      stored.push({ theme, id: message.source.externalMessageId });
      return "saved";
    },
  };
  const listing: ThemeListing = { theme: "Leituras", total: 1, items: [ENTRY] };
  const manage = createManageSources({
    state,
    sources: {
      list: async () => {
        managed.push("list");
        return [];
      },
      checkFollow: async () => ({ kind: "not_found" }),
      follow: async () => ({ kind: "not_found" }),
      stop: async () => ({ kind: "not_found" }),
      deletionTarget: async () => ({ kind: "not_found" }),
      requestDeletion: async () => ({ outcome: "requested", deletionId: "d-1", title: "x" }),
    },
  });
  const ask = createAskQuestion({
    identity: { resolve: async () => ({ userId: "user-1", spaceId: "space-1" }) },
    search: {
      async search(req) {
        searches.push(req.query);
        return { results: [], lowConfidence: true };
      },
    },
    generator: createDeterministicAnswerGenerator(),
    manage,
    ...(opts.saved === false
      ? {}
      : {
          saved: {
            save: createSaveContent({ pending, content }),
            listing: createSavedListing({
              library: {
                listTheme: async (_s, theme) => (theme.toLowerCase() === "leituras" ? listing : { theme: null, total: 0, items: [] }),
                listThemes: async () => [{ theme: "Leituras", count: 1 }],
                savedMessage: async (_s, id) => (id === ENTRY.messageId ? { itemId: "item-1", theme: "Leituras", text: ENTRY.text } : null),
              },
              async forget(_ctx, id) {
                forgotten.push(id);
                return { theme: "Leituras" };
              },
              citations: state,
              state,
            }),
          },
        }),
  });
  const send = (text: string, overrides: Partial<CanonicalMessage> = {}) =>
    ask(canonicalMessage({ source: { provider: "fake", accountId: "agent", conversationId: "agent:dono", externalMessageId: `m-${Math.random()}` }, text, ...overrides }));
  return { send, searches, stored, forgotten, managed, pending, state };
}

describe("encaminhado e mídia", () => {
  it("o encaminhado espera o pedido: um aviso por leva e nenhuma busca", async () => {
    const { send, searches } = setup();
    expect((await send("recomendo o Temporal", { isForwarded: true }))?.text).toBe(SAVE_TEXT.received);
    expect(await send("outro", { isForwarded: true })).toBeNull();
    expect(searches).toEqual([]);
  });

  it("áudio mandado direto também espera (nunca é pergunta)", async () => {
    const { send, searches } = setup();
    expect((await send("", { kind: "audio" }))?.text).toBe(SAVE_TEXT.received);
    expect(searches).toEqual([]);
  });

  it("sem as portas da 009, o encaminhado continua pergunta e a mídia recebe o 'só texto'", async () => {
    const { send, searches } = setup({ saved: false });
    await send("recomendo o Temporal", { isForwarded: true });
    expect(searches).toEqual(["recomendo o Temporal"]);
    expect((await send("", withoutText(canonicalMessage({ kind: "audio" }))))?.text).toContain("só entendo");
  });
});

describe("guardar", () => {
  it("'guarda em X' guarda o que espera, antes dos comandos e sem buscar", async () => {
    const { send, stored, searches, managed } = setup();
    await send("recomendo o Temporal", { isForwarded: true, source: { provider: "fake", accountId: "agent", conversationId: "agent:dono", externalMessageId: "fw-1" } });
    expect((await send("guarda em Arquitetura"))?.text).toBe("Guardei em Arquitetura.");
    expect(stored).toEqual([{ theme: "Arquitetura", id: "fw-1" }]);
    expect(searches).toEqual([]);
    expect(managed).toEqual([]);
  });

  it("pergunta com a palavra continua pergunta", async () => {
    const { send, searches, stored } = setup();
    await send("como guardar senhas no cofre?");
    expect(searches).toEqual(["como guardar senhas no cofre?"]);
    expect(stored).toEqual([]);
  });

  it("sem tema, pergunta; um comando no meio não vira tema; a resposta curta vira o tema", async () => {
    const { send, stored, managed } = setup();
    await send("texto", { isForwarded: true });
    expect((await send("guarda isso"))?.text).toBe(SAVE_TEXT.askTheme);
    await send("grupos");
    expect(managed).toEqual(["list"]);
    expect(stored).toEqual([]);
    expect((await send("Arquitetura"))?.text).toBe("Guardei em Arquitetura.");
  });

  it("o aviso de 'sem tema' vem antes da próxima resposta, uma vez", async () => {
    let t = 1_000_000;
    const pending = createMemoryPendingForwards<SaveContext>({ now: () => t, onUntitled: async (_c, m) => m.length });
    const save = createSaveContent({ pending, content: { save: async () => "saved" } });
    const ctx: SaveContext = { userId: "user-1", spaceId: "space-1", provider: "fake", accountId: "fake-operator" };
    save.hold(ctx, canonicalMessage({ isForwarded: true }));
    await save.run(ctx, { kind: "ask_theme" }, canonicalMessage());
    t += 10 * 60_000;
    await pending.sweep();
    expect(save.untitledNotice(ctx)).toBe(SAVE_TEXT.untitledNotice);
    expect(save.untitledNotice(ctx)).toBeNull();
  });
});

describe("listar e esquecer", () => {
  it("a listagem grava as citações, e 'esquece a 1' pede confirmação e apaga no 'confirmo'", async () => {
    const { send, forgotten, state } = setup();
    const listing = await send("o que guardei sobre leituras?");
    expect(listing?.text.split("\n")[0]).toBe("Guardados em Leituras (1):");
    expect((await state.citations("user-1", "fake"))?.items).toEqual([{ index: 1, messageId: ENTRY.messageId, kind: "text" }]);
    expect((await send("esquece a 1"))?.text).toBe(SAVE_TEXT.forgetAsk("o Temporal resolveu", "Leituras"));
    expect((await send("confirmo"))?.text).toBe(SAVE_TEXT.forgotten("Leituras"));
    expect(forgotten).toEqual([ENTRY.messageId]);
    // Sem nada pendente, "confirmo" segue como na S5 (vira pergunta) e não apaga de novo.
    await send("confirmo");
    expect(forgotten).toEqual([ENTRY.messageId]);
  });

  it("'confirmo apagar X' com um esquecer pendente não apaga nada", async () => {
    const { send, forgotten } = setup();
    await send("guardados leituras");
    await send("esquece a 1");
    expect((await send("confirmo apagar Leituras"))?.text).toBe(MANAGEMENT_TEXT.nothingPending);
    expect(forgotten).toEqual([]);
  });

  it("'esquece a N' de uma citação que não é guardado é recusado", async () => {
    const { send, state } = setup();
    await state.saveCitations("user-1", "fake", { items: [{ index: 1, messageId: "de-um-grupo" }], at: new Date() });
    expect((await send("esquece a 1"))?.text).toBe(SAVE_TEXT.notSaved);
  });

  it("temas e tema vazio", async () => {
    const { send } = setup();
    expect((await send("temas"))?.text).toBe("Seus temas: Leituras (1).");
    expect((await send("guardados finanças"))?.text).toBe("Você ainda não guardou nada sobre finanças.\nSeus temas: Leituras.");
  });
});
