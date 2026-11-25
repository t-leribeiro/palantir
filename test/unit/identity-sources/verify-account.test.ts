// T007 (feature 006): código de verificação de posse (D-11, RN-02).
import { describe, expect, it } from "vitest";
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  createIssueVerificationCode,
  createResolveAccount,
  createVerifyAccountCode,
  formatCode,
  type IdentityRepository,
  type LiveVerification,
  type VerificationRepository,
} from "../../../src/modules/identity/index.js";
import { codeMatches, generateCode, hashCode } from "../../../src/modules/identity/domain/verification.js";

function memoryRepo() {
  const rows: (LiveVerification & { accountId: string; consumed: boolean; invalidated: boolean })[] = [];
  const activated: string[] = [];
  let seq = 0;
  const repo: VerificationRepository = {
    async issue(accountId, salt, hash, expiresAt) {
      for (const r of rows) if (r.accountId === accountId && !r.consumed) r.invalidated = true;
      rows.push({ id: `v${(seq += 1)}`, accountId, salt, hash, expiresAt, attempts: 0, consumed: false, invalidated: false });
    },
    async live(accountId) {
      return rows.find((r) => r.accountId === accountId && !r.consumed && !r.invalidated) ?? null;
    },
    async recordFailure(id, max) {
      const row = rows.find((r) => r.id === id);
      if (!row) return max;
      const attempts = row.attempts + 1;
      Object.assign(row, { attempts, invalidated: attempts >= max });
      return attempts;
    },
    async consume(id, accountId) {
      const row = rows.find((r) => r.id === id && !r.consumed && !r.invalidated);
      if (!row) return false;
      row.consumed = true;
      activated.push(accountId);
      return true;
    },
  };
  return { repo, rows, activated };
}

const now = new Date("2026-11-24T20:00:00Z");
const clock = () => now;

describe("domínio da verificação", () => {
  it("gera 6 dígitos com zeros à esquerda e confere o hash com sal", () => {
    expect(generateCode(() => 42)).toBe("000042");
    expect(generateCode(() => 999_999)).toBe("999999");
    const salt = Buffer.alloc(16, 1);
    const hash = hashCode(salt, "123456");
    expect(codeMatches(salt, hash, "123456")).toBe(true);
    expect(codeMatches(salt, hash, "123457")).toBe(false);
    expect(codeMatches(Buffer.alloc(16, 2), hash, "123456")).toBe(false);
    expect(hash.toString("hex")).not.toContain("123456");
    expect(formatCode("482913")).toBe("482 913");
  });
});

describe("emitir e conferir o código", () => {
  it("o código certo dentro do prazo ativa a conta e não vale de novo", async () => {
    const { repo, activated, rows } = memoryRepo();
    const { code, expiresAt } = await createIssueVerificationCode(repo, { now: clock })("acc-1");
    expect(expiresAt.getTime() - now.getTime()).toBe(CODE_TTL_MS);
    expect(rows[0]?.hash).not.toEqual(Buffer.from(code));
    const verify = createVerifyAccountCode(repo, { now: clock });
    expect(await verify("acc-1", code)).toEqual({ kind: "verified" });
    expect(activated).toEqual(["acc-1"]);
    expect(await verify("acc-1", code)).toEqual({ kind: "expired" });
  });

  it("errar conta as tentativas e, na 5ª, invalida o código", async () => {
    const { repo } = memoryRepo();
    const { code } = await createIssueVerificationCode(repo, { now: clock, random: () => 123_456 })("acc-1");
    const verify = createVerifyAccountCode(repo, { now: clock });
    for (let remaining = MAX_ATTEMPTS - 1; remaining >= 1; remaining -= 1) {
      expect(await verify("acc-1", "000000")).toEqual({ kind: "wrong", remaining });
    }
    expect(await verify("acc-1", "000000")).toEqual({ kind: "locked" });
    expect(await verify("acc-1", code)).toEqual({ kind: "expired" });
  });

  it("código vencido ou inexistente é 'expirado'; um código novo invalida o anterior", async () => {
    const { repo } = memoryRepo();
    const issue = createIssueVerificationCode(repo, { now: clock, random: () => 111_111 });
    await issue("acc-1");
    const later = createVerifyAccountCode(repo, { now: () => new Date(now.getTime() + CODE_TTL_MS) });
    expect(await later("acc-1", "111111")).toEqual({ kind: "expired" });
    expect(await createVerifyAccountCode(repo)("acc-sem-codigo", "111111")).toEqual({ kind: "expired" });

    const second = createIssueVerificationCode(repo, { now: clock, random: () => 222_222 });
    await second("acc-1");
    const verify = createVerifyAccountCode(repo, { now: clock });
    expect(await verify("acc-1", "111111")).toEqual({ kind: "wrong", remaining: MAX_ATTEMPTS - 1 });
    expect(await verify("acc-1", "222222")).toEqual({ kind: "verified" });
  });
});

describe("resolução da conta com o estado", () => {
  const repoWith = (status: "active" | "pending" | "revoked"): IdentityRepository => ({
    findAccount: async () => ({ account: { id: "acc-1", userId: "u1", provider: "whatsapp", externalAccountId: "+55", status }, personalSpaceId: "s1" }),
  });

  it("ativa traz usuário e espaço; pendente só usuário e conta; revogada e desconhecida não resolvem", async () => {
    expect(await createResolveAccount(repoWith("active"))("whatsapp", "+55")).toEqual({ status: "active", userId: "u1", spaceId: "s1", accountId: "acc-1" });
    expect(await createResolveAccount(repoWith("pending"))("whatsapp", "+55")).toEqual({ status: "pending", userId: "u1", accountId: "acc-1" });
    expect(await createResolveAccount(repoWith("revoked"))("whatsapp", "+55")).toBeNull();
    expect(await createResolveAccount({ findAccount: async () => null })("whatsapp", "+55")).toBeNull();
  });
});
