// T006: cadastro do número pessoal por comando (RF-03, RN-03, RN-07 da S2; D-08).
import { describe, expect, it } from "vitest";
import {
  createLinkWhatsAppNumber,
  type WhatsAppAccountRepository,
  type WhatsAppAccountRow,
} from "../../../src/modules/identity/index.js";

function fakeRepo(initial: WhatsAppAccountRow[] = []) {
  const rows = initial.map((r) => ({ ...r }));
  const repo: WhatsAppAccountRepository = {
    async findByExternalId(externalAccountId) {
      return rows.find((r) => r.externalAccountId === externalAccountId) ?? null;
    },
    async findForUser(userId) {
      return rows.find((r) => r.userId === userId) ?? null;
    },
    async setPending(accountId, externalAccountId) {
      const row = rows.find((r) => r.id === accountId);
      if (row) Object.assign(row, { externalAccountId, status: "pending" });
    },
    async create(userId, externalAccountId) {
      const id = `acc-${rows.length + 1}`;
      rows.push({ id, userId, externalAccountId, status: "pending" });
      return id;
    },
    async countSources(accountId) {
      return accountId === "acc-1" ? 2 : 0;
    },
  };
  return { repo, rows };
}

const pendingOwner: WhatsAppAccountRow = { id: "acc-1", userId: "u1", externalAccountId: "unlinked:u1", status: "pending" };

describe("linkWhatsAppNumber", () => {
  it("grava o número na conta provisória, que fica pendente até a verificação (feature 006, RN-02)", async () => {
    const { repo, rows } = fakeRepo([pendingOwner]);
    const result = await createLinkWhatsAppNumber(repo)("u1", "+55 11 98888-7777");
    expect(result).toEqual({ outcome: "linked", phone: "+5511988887777", importedSources: 2, accountId: "acc-1", needsVerification: true });
    expect(rows).toEqual([{ id: "acc-1", userId: "u1", externalAccountId: "+5511988887777", status: "pending" }]);
  });

  it("mesmo número já verificado não muda nada nem pede código", async () => {
    const { repo } = fakeRepo([{ ...pendingOwner, externalAccountId: "+5511988887777", status: "active" }]);
    expect(await createLinkWhatsAppNumber(repo)("u1", "5511988887777")).toMatchObject({ outcome: "unchanged", needsVerification: false });
  });

  it("mesmo número ainda pendente pede um código novo (inclui a volta da migração 0008)", async () => {
    const { repo } = fakeRepo([{ ...pendingOwner, externalAccountId: "+5511988887777" }]);
    expect(await createLinkWhatsAppNumber(repo)("u1", "+55 11 98888-7777")).toMatchObject({ outcome: "pending", needsVerification: true });
  });

  it("troca o número da conta quando o usuário cadastra outro", async () => {
    const { repo, rows } = fakeRepo([{ ...pendingOwner, externalAccountId: "+5511988887777", status: "active" }]);
    expect((await createLinkWhatsAppNumber(repo)("u1", "+55 11 97777-6666")).outcome).toBe("replaced");
    expect(rows[0]).toMatchObject({ externalAccountId: "+5511977776666", status: "pending" });
  });

  it("cria a conta pendente quando o usuário não tem conta WhatsApp", async () => {
    const { repo, rows } = fakeRepo();
    expect(await createLinkWhatsAppNumber(repo)("u2", "+55 11 98888-7777")).toMatchObject({ outcome: "linked", accountId: "acc-1", needsVerification: true });
    expect(rows).toEqual([{ id: "acc-1", userId: "u2", externalAccountId: "+5511988887777", status: "pending" }]);
  });

  it("recusa número de outro usuário sem revelar quem é", async () => {
    const { repo } = fakeRepo([{ id: "acc-9", userId: "outro", externalAccountId: "+5511988887777", status: "active" }, pendingOwner]);
    await expect(createLinkWhatsAppNumber(repo)("u1", "+55 11 98888-7777")).rejects.toMatchObject({
      code: "already_linked",
      message: "Este número já está cadastrado.",
    });
  });

  it("recusa número inválido", async () => {
    const { repo } = fakeRepo([pendingOwner]);
    await expect(createLinkWhatsAppNumber(repo)("u1", "11 98888")).rejects.toMatchObject({ code: "invalid_phone" });
  });
});
