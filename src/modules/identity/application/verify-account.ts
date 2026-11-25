// Emissão e conferência do código de verificação da conta (feature 006, D-11, RF-01, RF-15).
import { CODE_TTL_MS, MAX_ATTEMPTS, codeMatches, generateCode, hashCode, newSalt } from "../domain/verification.js";

export interface LiveVerification {
  readonly id: string;
  readonly salt: Uint8Array;
  readonly hash: Uint8Array;
  readonly expiresAt: Date;
  readonly attempts: number;
}

export interface VerificationRepository {
  /** Invalida o código vivo da conta, se houver, e grava o novo (uma transação). */
  issue(accountId: string, salt: Uint8Array, hash: Uint8Array, expiresAt: Date): Promise<void>;
  live(accountId: string): Promise<LiveVerification | null>;
  /** Soma uma tentativa errada; na última, invalida o código. Devolve as tentativas feitas. */
  recordFailure(verificationId: string, maxAttempts: number): Promise<number>;
  /** Consome o código e ativa a conta com `verified_at` (uma transação). `false` se já foi consumido. */
  consume(verificationId: string, accountId: string): Promise<boolean>;
}

export type IssueVerificationCode = (accountId: string) => Promise<{ readonly code: string; readonly expiresAt: Date }>;

export function createIssueVerificationCode(
  repo: VerificationRepository,
  options: { readonly now?: () => Date; readonly random?: (max: number) => number } = {},
): IssueVerificationCode {
  const now = options.now ?? (() => new Date());
  return async (accountId) => {
    const code = generateCode(options.random);
    const salt = newSalt();
    const expiresAt = new Date(now().getTime() + CODE_TTL_MS);
    await repo.issue(accountId, salt, hashCode(salt, code), expiresAt);
    return { code, expiresAt };
  };
}

export type VerifyOutcome =
  | { readonly kind: "verified" }
  | { readonly kind: "wrong"; readonly remaining: number }
  | { readonly kind: "locked" }
  | { readonly kind: "expired" };

export type VerifyAccountCode = (accountId: string, code: string) => Promise<VerifyOutcome>;

export function createVerifyAccountCode(repo: VerificationRepository, options: { readonly now?: () => Date } = {}): VerifyAccountCode {
  const now = options.now ?? (() => new Date());
  return async (accountId, code) => {
    const live = await repo.live(accountId);
    if (!live || live.expiresAt.getTime() <= now().getTime()) return { kind: "expired" };
    if (codeMatches(live.salt, live.hash, code)) {
      return (await repo.consume(live.id, accountId)) ? { kind: "verified" } : { kind: "expired" };
    }
    const attempts = await repo.recordFailure(live.id, MAX_ATTEMPTS);
    return attempts >= MAX_ATTEMPTS ? { kind: "locked" } : { kind: "wrong", remaining: MAX_ATTEMPTS - attempts };
  };
}
