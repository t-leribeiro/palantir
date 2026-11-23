// T005: ritmo de envio de no máximo 1 mensagem por segundo por destinatário (RF-09 da S2, D-12).
import { describe, expect, it } from "vitest";
import { createSendPacer, type PacerClock } from "../../../src/channels/whatsapp/pacer.js";

function virtualClock(): PacerClock & { readonly elapsed: () => number } {
  let now = 0;
  return {
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    elapsed: () => now,
  };
}

describe("createSendPacer", () => {
  it("espaça em pelo menos 1 s os envios ao mesmo destinatário, em ordem", async () => {
    const clock = virtualClock();
    const pacer = createSendPacer({ minIntervalMs: 1000, clock });
    const sentAt: { part: number; at: number }[] = [];
    await Promise.all(Array.from({ length: 10 }, (_, part) => pacer.send("ana", async () => void sentAt.push({ part, at: clock.now() }))));
    expect(sentAt.map((s) => s.part)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const gaps = sentAt.slice(1).map((s, i) => s.at - (sentAt[i]?.at ?? 0));
    expect(gaps.every((gap) => gap >= 1000)).toBe(true);
    expect(clock.elapsed()).toBeGreaterThanOrEqual(9000);
  });

  it("não atrasa destinatários diferentes entre si", async () => {
    const clock = virtualClock();
    const pacer = createSendPacer({ minIntervalMs: 1000, clock });
    const at: Record<string, number> = {};
    await pacer.send("ana", async () => void (at.ana = clock.now()));
    await pacer.send("bia", async () => void (at.bia = clock.now()));
    expect(at.bia).toBe(at.ana);
  });

  it("uma falha não trava os próximos envios do mesmo destinatário", async () => {
    const pacer = createSendPacer({ minIntervalMs: 1000, clock: virtualClock() });
    await expect(pacer.send("ana", async () => Promise.reject(new Error("falhou")))).rejects.toThrow("falhou");
    let sent = false;
    await pacer.send("ana", async () => void (sent = true));
    expect(sent).toBe(true);
  });
});
