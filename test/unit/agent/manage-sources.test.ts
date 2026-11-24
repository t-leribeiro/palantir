// T015 e T016 (feature 006): conta pendente e comandos de gestão no agente (interfaces/comandos-do-agente.md).
import { describe, expect, it } from "vitest";
import type { CanonicalMessage } from "../../../src/contracts/channel/knowledge-channel.js";
import {
  HELP_TEXT,
  PENDING_TTL_MS,
  createAskQuestion,
  createDeterministicAnswerGenerator,
  createManageSources,
  type AccountGate,
  type ConversationStateStore,
  type ListItem,
  type SourceManagementPort,
  type StoredListing,
  type StoredPending,
} from "../../../src/modules/agent/index.js";
import type { DeletionTarget, FollowCheck, StopResult } from "../../../src/modules/sources/index.js";
import { canonicalMessage } from "../../support/messages.js";

function memoryState(): ConversationStateStore & { listingNow(): StoredListing | null } {
  let listing: StoredListing | null = null;
  let pending: StoredPending | null = null;
  return {
    listingNow: () => listing,
    listing: async () => listing,
    saveListing: async (_u, _p, l) => {
      listing = l;
    },
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
  };
}

const ITEMS: ListItem[] = [
  { ref: "source:1", title: "Contas da Casa", state: "conversation" },
  { ref: "group:2", title: "Contas do Prédio", state: "not_following" },
  { ref: "group:3", title: "Projeto X", state: "not_following" },
  { ref: "source:4", title: "T3", state: "imported" },
  { ref: "group:5", title: "Vizinho", state: "other_account" },
];

function fakePort() {
  const calls: string[] = [];
  const followCheck = (ref: string): FollowCheck => {
    const item = ITEMS.find((i) => i.ref === ref);
    if (!item) return { kind: "not_found" };
    if (item.state === "other_account") return { kind: "other_account", title: item.title };
    if (ref.startsWith("source:")) return { kind: "not_a_group", title: item.title };
    return { kind: "ok", title: item.title, linksImport: item.title === "Projeto X" };
  };
  const port: SourceManagementPort = {
    list: async () => ITEMS,
    checkFollow: async (_o, ref) => followCheck(ref),
    async follow(_o, ref, channel) {
      calls.push(`follow ${ref} ${channel}`);
      return followCheck(ref);
    },
    async stop(_o, ref): Promise<StopResult> {
      calls.push(`stop ${ref}`);
      const item = ITEMS.find((i) => i.ref === ref);
      return item?.title === "Projeto X" ? { kind: "stopped", title: "Projeto X" } : { kind: "not_following", title: item?.title ?? "" };
    },
    async deletionTarget(_o, ref): Promise<DeletionTarget> {
      const item = ITEMS.find((i) => i.ref === ref);
      if (!item) return { kind: "not_found" };
      if (item.state === "other_account") return { kind: "other_account", title: item.title };
      return ref === "group:2" ? { kind: "nothing_stored", title: item.title } : { kind: "ok", sourceId: `src-${ref}`, title: item.title };
    },
    async requestDeletion(input) {
      calls.push(`delete ${input.sourceId} ${input.title} ${input.notify.provider}:${input.notify.accountId}`);
      return { outcome: "requested", deletionId: "del-1", title: input.title };
    },
  };
  return { port, calls };
}

function setup() {
  let now = new Date("2026-11-24T20:00:00Z");
  const state = memoryState();
  const { port, calls } = fakePort();
  const manage = createManageSources({ sources: port, state, now: () => now });
  const ctx = { userId: "u1", spaceId: "s1", provider: "whatsapp", accountId: "+5511988887777" };
  const say = async (text: string) => (await manage(ctx, text))?.text ?? null;
  return { say, calls, state, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

describe("comandos de gestão", () => {
  it("lista com estado e guarda a lista; 'mais' sem lista pede a lista", async () => {
    const { say, state } = setup();
    expect(await say("mais")).toBe('Mande "grupos" para ver a lista atual.');
    const text = await say("grupos");
    expect(text).toContain("Seus grupos e conversas (1–5 de 5):");
    expect(text).toContain("3. Projeto X · não acompanhado");
    expect(text).toContain("5. Vizinho · acompanhado por outra conta");
    expect(state.listingNow()?.page).toBe(1);
    expect(await say("mais")).toBe("Não há mais itens.");
  });

  it("acompanhar pede confirmação, avisa a ligação com a importação e só autoriza com 'confirmo'", async () => {
    const { say, calls } = setup();
    await say("grupos");
    const asked = await say("acompanhar 3");
    expect(asked).toContain('Para acompanhar "Projeto X"');
    expect(asked).toContain('O histórico importado de "Projeto X" será ligado a este grupo.');
    expect(calls).toEqual([]);
    expect(await say("confirmo")).toBe('Pronto: "Projeto X" está sendo acompanhado. As mensagens novas entram a partir de agora.');
    expect(calls).toEqual(["follow group:3 whatsapp"]);
    expect(await say("confirmo")).toBeNull();
  });

  it("confirmação vencida não autoriza e explica", async () => {
    const { say, calls, advance } = setup();
    await say("acompanhar Projeto X");
    advance(PENDING_TTL_MS);
    expect(await say("confirmo")).toBe('O pedido expirou. Mande "acompanhar Projeto X" de novo.');
    expect(calls).toEqual([]);
  });

  it("acompanhar conversa importada ou grupo de outra conta explica e não pede confirmação", async () => {
    const { say } = setup();
    expect(await say("acompanhar T3")).toBe('"T3" é uma conversa importada: só dá para acompanhar grupos de que o número participa.');
    expect(await say("acompanhar vizinho")).toBe("Esse grupo é acompanhado por outra conta.");
    expect(await say("confirmo")).toBeNull();
  });

  it("parar tem efeito sem confirmação", async () => {
    const { say, calls } = setup();
    expect(await say("parar projeto x")).toContain('Parei de acompanhar "Projeto X"');
    expect(await say("parar T3")).toBe('"T3" não está sendo acompanhado.');
    expect(calls).toEqual(["stop group:3", "stop source:4"]);
  });

  it("apagar exige 'confirmo apagar <nome>' e pede a exclusão com a conta do aviso", async () => {
    const { say, calls } = setup();
    expect(await say("apagar T3")).toContain('responda "confirmo apagar T3" em até 5 minutos');
    expect(await say("confirmo")).toBe('Para apagar "T3", a confirmação precisa ser "confirmo apagar T3".');
    expect(await say("confirmo apagar Contas da Casa")).toBe('Para apagar "T3", a confirmação precisa ser "confirmo apagar T3".');
    expect(calls).toEqual([]);
    expect(await say("Confirmo apagar t3.")).toBe('Apagando "T3". Aviso aqui quando terminar.');
    expect(calls).toEqual(["delete src-source:4 T3 whatsapp:+5511988887777"]);
    expect(await say("confirmo apagar T3")).toBe('Não há nada esperando confirmação. Mande "apagar <nome>" primeiro.');
  });

  it("apagar grupo sem nada guardado ou de outra conta não pede confirmação", async () => {
    const { say } = setup();
    expect(await say("apagar prédio")).toBe('Não há nada guardado de "Contas do Prédio".');
    expect(await say("apagar vizinho")).toBe("Esse grupo é acompanhado por outra conta.");
  });

  it("confirmação de exclusão vencida não apaga", async () => {
    const { say, calls, advance } = setup();
    await say("apagar T3");
    advance(PENDING_TTL_MS + 1);
    expect(await say("confirmo apagar T3")).toBe('O pedido expirou. Mande "apagar T3" de novo.');
    expect(calls).toEqual([]);
  });

  it("nome ambíguo lista as opções, que viram a lista vigente; número sem lista pede a lista", async () => {
    const { say, state } = setup();
    expect(await say("acompanhar 2")).toBe('Não sei qual é o 2. Mande "grupos" para ver a lista atual.');
    expect(await say("apagar contas")).toBe("Encontrei mais de uma: 1. Contas da Casa · 2. Contas do Prédio. Repita com o número ou o nome completo.");
    expect(state.listingNow()?.items.map((i) => i.title)).toEqual(["Contas da Casa", "Contas do Prédio"]);
    expect(await say("apagar 1")).toContain('"confirmo apagar Contas da Casa"');
    expect(await say("apagar xyz")).toBe('Não encontrei "xyz" entre suas conversas. Mande "grupos" para ver a lista.');
  });

  it("o que não é comando segue como pergunta", async () => {
    const { say } = setup();
    expect(await say("quem falou de grupos?")).toBeNull();
  });
});

describe("conta pendente no agente (RN-02, D-20)", () => {
  const message = (text: string): CanonicalMessage =>
    canonicalMessage({
      id: "m1",
      source: { provider: "whatsapp", accountId: "agent", conversationId: "dm" },
      sender: { externalId: "+5511988887777", displayName: "Leandro" },
      timestamp: "2026-11-24T20:00:00-03:00",
      kind: "text",
      text,
      provenance: { captureMethod: "forwarded_to_agent", capturedAt: "2026-11-24T20:00:01-03:00", adapter: "whatsapp" },
    });

  function ask(status: "pending" | "active" | null, verify: AccountGate["verify"] = async () => ({ kind: "verified" })) {
    const searches: string[] = [];
    const accounts: AccountGate = {
      resolve: async () =>
        status === "pending" ? { status, userId: "u1", accountId: "acc-1" } : status === "active" ? { status, userId: "u1", spaceId: "s1", accountId: "acc-1" } : null,
      verify,
    };
    const handler = createAskQuestion({
      identity: { resolve: async () => null },
      search: {
        async search(req) {
          searches.push(req.query);
          return { results: [], lowConfidence: true };
        },
      },
      generator: createDeterministicAnswerGenerator(),
      unknownSender: "silent",
      accounts,
    });
    return { handler, searches };
  }

  it("só o código é aceito; o resto recebe a instrução, sem busca", async () => {
    const { handler, searches } = ask("pending");
    expect((await handler(message("quem falou de X?")))?.text).toContain("Sua conta ainda não foi verificada");
    expect((await handler(message("482 913")))?.text).toBe("Conta verificada. Pode perguntar e gerenciar seus grupos por aqui.");
    expect(searches).toEqual([]);
  });

  it.each([
    [{ kind: "wrong", remaining: 4 } as const, "Código incorreto. Restam 4 tentativas."],
    [{ kind: "wrong", remaining: 1 } as const, "Código incorreto. Restam 1 tentativa."],
    [{ kind: "locked" } as const, "Código invalidado. Peça um novo com npm run whatsapp:link."],
    [{ kind: "expired" } as const, "Código expirado. Peça um novo com npm run whatsapp:link."],
  ])("resultado %j", async (outcome, text) => {
    const { handler } = ask("pending", async () => outcome);
    expect((await handler(message("000000")))?.text).toBe(text);
  });

  it("desconhecido continua em silêncio; ativo pergunta normalmente e recebe a ajuda nova", async () => {
    expect(await ask(null).handler(message("oi"))).toBeNull();
    const active = ask("active");
    expect((await active.handler(message("ajuda")))?.text).toBe(HELP_TEXT);
    expect(HELP_TEXT).toContain("apagar T3");
    await active.handler(message("quem falou de X?"));
    expect(active.searches).toHaveLength(1);
  });
});
