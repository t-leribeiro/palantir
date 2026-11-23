import { describe, expect, it } from "vitest";
import { createResolveUserByChannelAccount, type ChannelAccountStatus } from "../../../src/modules/identity/index.js";
import { createIsSourceAuthorized, decideIngestion, type Source, type SourceStatus } from "../../../src/modules/sources/index.js";

function account(status: ChannelAccountStatus) {
  return {
    account: { id: "acc-1", userId: "user-1", provider: "fake", externalAccountId: "fake-operator", status },
    personalSpaceId: "space-1",
  };
}

describe("identity: resolver usuário pela conta de canal", () => {
  it("resolve usuário e espaço pessoal de conta ativa", async () => {
    const resolve = createResolveUserByChannelAccount({ findAccount: async () => account("active") });
    expect(await resolve("fake", "fake-operator")).toEqual({ userId: "user-1", spaceId: "space-1" });
  });

  it.each(["pending", "revoked"] as const)("não resolve conta %s", async (status) => {
    const resolve = createResolveUserByChannelAccount({ findAccount: async () => account(status) });
    expect(await resolve("fake", "fake-operator")).toBeNull();
  });

  it("não resolve conta desconhecida e consulta pelo provedor e id externo", async () => {
    const calls: string[][] = [];
    const resolve = createResolveUserByChannelAccount({
      findAccount: async (p, e) => {
        calls.push([p, e]);
        return null;
      },
    });
    expect(await resolve("whatsapp", "5511")).toBeNull();
    expect(calls).toEqual([["whatsapp", "5511"]]);
  });
});

function source(status: SourceStatus): Source {
  return {
    id: "src-1",
    spaceId: "space-1",
    channelAccountId: "acc-1",
    externalConversationId: "fake-group-1",
    title: "Grupo de teste",
    kind: "group",
    status,
  };
}

describe("sources: decisão de ingestão (opt-in por conversa)", () => {
  it("autoriza fonte autorizada com fonte e espaço", () => {
    expect(decideIngestion(source("authorized"))).toEqual({ status: "authorized", sourceId: "src-1", spaceId: "space-1" });
  });

  it.each(["not_authorized", "revoked"] as const)("recusa fonte %s", (status) => {
    expect(decideIngestion(source(status))).toEqual({ status: "not_authorized" });
  });

  it("sinaliza fonte em exclusão", () => {
    expect(decideIngestion(source("deleting"))).toEqual({ status: "source_deleting" });
  });

  it("recusa fonte desconhecida", async () => {
    const check = createIsSourceAuthorized({ findByConversation: async () => null });
    expect(await check({ provider: "fake", accountId: "x", conversationId: "y" })).toEqual({ status: "not_authorized" });
  });
});
