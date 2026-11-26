// T011 (feature 009, D-05, D-14): espera em memória com relógio injetado.
import { describe, expect, it } from "vitest";
import type { CanonicalMessage } from "../../../src/contracts/channel/knowledge-channel.js";
import { PENDING_HARD_LIMIT, PENDING_TTL_MS } from "../../../src/modules/agent/application/pending-forwards.js";
import { createMemoryPendingForwards } from "../../../src/modules/agent/infrastructure/memory-pending-forwards.js";

const msg = (id: string) => ({ source: { externalMessageId: id } }) as unknown as CanonicalMessage;
const ids = (messages: readonly CanonicalMessage[]) => messages.map((m) => m.source.externalMessageId ?? "");

function clock() {
  let t = 1_000_000;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("espera do encaminhado", () => {
  it("só o primeiro de uma leva abre a leva; depois de esvaziar, abre de novo", () => {
    const pending = createMemoryPendingForwards<string>();
    expect(pending.add("dono", "ctx", msg("a")).opened).toBe(true);
    expect(pending.add("dono", "ctx", msg("b")).opened).toBe(false);
    expect(pending.add("outro", "ctx", msg("x")).opened).toBe(true);
    expect(ids(pending.takeAll("dono"))).toEqual(["a", "b"]);
    expect(pending.add("dono", "ctx", msg("c")).opened).toBe(true);
  });

  it("tira só a citada e mantém as outras na ordem", () => {
    const pending = createMemoryPendingForwards<string>();
    for (const id of ["a", "b", "c"]) pending.add("dono", "ctx", msg(id));
    expect(pending.take("dono", "b")?.source.externalMessageId).toBe("b");
    expect(pending.take("dono", "b")).toBeNull();
    expect(ids(pending.takeAll("dono"))).toEqual(["a", "c"]);
  });

  it("descarta sem pedido depois de 10 minutos, contando só o número", async () => {
    const c = clock();
    const discarded: number[] = [];
    const pending = createMemoryPendingForwards<string>({ now: c.now, observer: { discarded: (n) => discarded.push(n) } });
    pending.add("dono", "ctx", msg("a"));
    c.advance(PENDING_TTL_MS - 1);
    pending.add("dono", "ctx", msg("b"));
    await pending.sweep();
    expect(discarded).toEqual([]);
    c.advance(1);
    await pending.sweep();
    expect(discarded).toEqual([1]);
    expect(ids(pending.takeAll("dono"))).toEqual(["b"]);
  });

  it("o que aguardava tema há 10 minutos vai para 'sem tema' e deixa o aviso para a próxima resposta", async () => {
    const c = clock();
    const untitled: string[][] = [];
    const pending = createMemoryPendingForwards<string>({
      now: c.now,
      onUntitled: async (context, messages) => {
        untitled.push([context, ...ids(messages)]);
        return messages.length;
      },
    });
    expect(pending.markAwaitingTheme("dono")).toBe(false);
    pending.add("dono", "ctx-1", msg("a"));
    pending.add("dono", "ctx-2", msg("b"));
    c.advance(5 * 60_000);
    expect(pending.markAwaitingTheme("dono")).toBe(true);
    expect(pending.awaitingTheme("dono")).toBe(true);
    // O prazo conta do pedido sem tema: o encaminhado mais velho que 10 min continua esperando o tema.
    c.advance(PENDING_TTL_MS - 1);
    await pending.sweep();
    expect(untitled).toEqual([]);
    c.advance(1);
    await pending.sweep();
    expect(untitled).toEqual([["ctx-2", "a", "b"]]);
    expect(pending.awaitingTheme("dono")).toBe(false);
    expect(pending.takeUntitledNotice("dono")).toBe(2);
    expect(pending.takeUntitledNotice("dono")).toBe(0);
  });

  it("se guardar em 'sem tema' falha, conta como descartado e não avisa", async () => {
    const c = clock();
    const discarded: number[] = [];
    const pending = createMemoryPendingForwards<string>({
      now: c.now,
      onUntitled: async () => {
        throw new Error("banco fora");
      },
      observer: { discarded: (n) => discarded.push(n) },
    });
    pending.add("dono", "ctx", msg("a"));
    pending.markAwaitingTheme("dono");
    c.advance(PENDING_TTL_MS);
    await pending.sweep();
    expect(discarded).toEqual([1]);
    expect(pending.takeUntitledNotice("dono")).toBe(0);
  });

  it("acima do teto de memória, descarta a mensagem nova", () => {
    const pending = createMemoryPendingForwards<string>();
    for (let i = 0; i < PENDING_HARD_LIMIT; i += 1) pending.add("dono", "ctx", msg(`m${i}`));
    expect(pending.add("dono", "ctx", msg("demais"))).toEqual({ opened: false, accepted: false });
    expect(pending.takeAll("dono")).toHaveLength(PENDING_HARD_LIMIT);
  });

  it("a varredura periódica não segura o processo", () => {
    const pending = createMemoryPendingForwards<string>();
    const stop = pending.start(10);
    stop();
  });
});
