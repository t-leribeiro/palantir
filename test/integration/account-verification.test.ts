// T007 (feature 006): repositório da verificação de posse com PostgreSQL real.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOperator } from "../../src/main/seed-data.js";
import { createIssueVerificationCode, createPgVerificationRepository, createVerifyAccountCode } from "../../src/modules/identity/index.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";
import { one } from "../support/rows.js";

let db: TestDatabase;
let accountId: string;

beforeAll(async () => {
  db = await startTestDatabase();
  accountId = (await seedOperator(db.pool, { provider: "whatsapp", accountId: "+5511988887777", displayName: "Leandro" })).accountId;
  await db.pool.query("UPDATE channel_accounts SET status = 'pending', verified_at = NULL WHERE id = $1", [accountId]);
});

afterAll(async () => {
  await db?.stop();
});

const account = async () =>
  one((await db.pool.query<{ status: string; verified: boolean }>("SELECT status, verified_at IS NOT NULL AS verified FROM channel_accounts WHERE id = $1", [accountId])).rows);

describe("verificação de posse no PostgreSQL", () => {
  it("guarda só o hash; um código novo invalida o anterior; o certo ativa a conta", async () => {
    const repo = createPgVerificationRepository(db.pool);
    const first = await createIssueVerificationCode(repo, { random: () => 111_111 })(accountId);
    const second = await createIssueVerificationCode(repo, { random: () => 222_222 })(accountId);
    const { rows } = await db.pool.query<{ live: boolean; hash: string }>(
      "SELECT (consumed_at IS NULL AND invalidated_at IS NULL) AS live, encode(code_hash, 'hex') AS hash FROM channel_account_verifications WHERE account_id = $1",
      [accountId],
    );
    expect(rows.filter((r) => r.live)).toHaveLength(1);
    expect(rows.map((r) => r.hash).join()).not.toMatch(new RegExp(`${first.code}|${second.code}`));

    const verify = createVerifyAccountCode(repo);
    expect(await verify(accountId, first.code)).toEqual({ kind: "wrong", remaining: 4 });
    expect(await account()).toEqual({ status: "pending", verified: false });
    expect(await verify(accountId, second.code)).toEqual({ kind: "verified" });
    expect(await account()).toEqual({ status: "active", verified: true });
  });

  it("a 5ª tentativa errada invalida o código", async () => {
    const repo = createPgVerificationRepository(db.pool);
    await createIssueVerificationCode(repo, { random: () => 333_333 })(accountId);
    const verify = createVerifyAccountCode(repo);
    for (let i = 0; i < 4; i += 1) await verify(accountId, "000000");
    expect(await verify(accountId, "000000")).toEqual({ kind: "locked" });
    expect(await verify(accountId, "333333")).toEqual({ kind: "expired" });
  });
});
