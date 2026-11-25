// T019 (feature 006): aviso de exclusão concluída, um só envio e devolução se falhar (D-10).
import { describe, expect, it } from "vitest";
import { createDeletionNotifier } from "../../../src/main/notify.js";
import type { DeletionNotices } from "../../../src/modules/sources/index.js";

function notices(claimable = true) {
  const log: string[] = [];
  let claimed = !claimable;
  const store: DeletionNotices = {
    async claim(id, provider) {
      log.push(`claim ${id} ${provider}`);
      if (claimed) return null;
      claimed = true;
      return { accountId: "+5511988887777", title: "T3", messages: 9842, audios: 1 };
    },
    async release(id) {
      log.push(`release ${id}`);
      claimed = false;
    },
    async forgetTitle(id) {
      log.push(`forget ${id}`);
    },
  };
  return { store, log };
}

describe("aviso de exclusão", () => {
  it("manda uma vez, com contagens no plural certo, e esquece o nome", async () => {
    const { store, log } = notices();
    const sent: { to: string; text: string }[] = [];
    const notify = createDeletionNotifier(store, "whatsapp", async (to, reply) => {
      sent.push({ to, text: reply.text });
    });
    expect(await notify({ kind: "source_deleted", deletionId: "d1" })).toBe("sent");
    expect(await notify({ kind: "source_deleted", deletionId: "d1" })).toBe("duplicate");
    expect(sent).toEqual([{ to: "+5511988887777", text: 'Terminei de apagar "T3": 9.842 mensagens e 1 áudio. Nada dele aparece mais nas respostas.' }]);
    expect(log).toEqual(["claim d1 whatsapp", "forget d1", "claim d1 whatsapp"]);
  });

  it("se o envio falhar, devolve a reivindicação e relança para nova tentativa", async () => {
    const { store, log } = notices();
    const notify = createDeletionNotifier(store, "fake", async () => {
      throw new Error("canal fora do ar");
    });
    await expect(notify({ kind: "source_deleted", deletionId: "d2" })).rejects.toThrow("canal fora do ar");
    expect(log).toEqual(["claim d2 fake", "release d2"]);
  });
});
