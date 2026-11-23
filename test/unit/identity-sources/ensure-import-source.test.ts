// T010: importar uma conversa a autoriza na conta whatsapp do dono (RN-01 da S1, D-10).
import { describe, expect, it } from "vitest";
import {
  createEnsureImportSource,
  importConversationId,
  unlinkedAccountId,
  type ImportSourceRepository,
} from "../../../src/modules/sources/index.js";

function repo(status = "authorized", created = true) {
  const calls: unknown[] = [];
  const r: ImportSourceRepository = {
    async ensurePendingAccount(userId, provider, externalAccountId) {
      calls.push(["account", userId, provider, externalAccountId]);
      return { accountRowId: "acc-1", externalAccountId };
    },
    async ensureAuthorizedSource(input) {
      calls.push(["source", input]);
      return { sourceId: "src-1", status, created };
    },
  };
  return { r, calls };
}

describe("importConversationId", () => {
  it("gera id estável sem acentos nem espaços", () => {
    expect(importConversationId("  Comunidade DevOps — Brasil! ")).toBe("export:comunidade-devops-brasil");
    expect(importConversationId("Arquitetura & Café")).toBe("export:arquitetura-cafe");
  });

  it("recusa nome sem letras ou números", () => {
    expect(() => importConversationId("!!!")).toThrow(/letras ou números/);
  });
});

describe("EnsureImportSource", () => {
  const owner = { userId: "u1", spaceId: "s1" };

  it("garante a conta whatsapp pendente do dono e a fonte autorizada", async () => {
    const { r, calls } = repo();
    const ref = await createEnsureImportSource(r)(owner, " Comunidade DevOps ");
    expect(calls).toEqual([
      ["account", "u1", "whatsapp", unlinkedAccountId("u1")],
      ["source", { spaceId: "s1", accountRowId: "acc-1", conversationId: "export:comunidade-devops", title: "Comunidade DevOps" }],
    ]);
    expect(ref).toEqual({
      sourceId: "src-1",
      provider: "whatsapp",
      accountId: "unlinked:u1",
      conversationId: "export:comunidade-devops",
      title: "Comunidade DevOps",
      created: true,
    });
  });

  it("recusa importar para conversa em exclusão", async () => {
    const { r } = repo("deleting", false);
    await expect(createEnsureImportSource(r)(owner, "X")).rejects.toMatchObject({ code: "source_deleting" });
  });
});
