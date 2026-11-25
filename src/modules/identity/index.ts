export type {
  ChannelAccount,
  ChannelAccountStatus,
  KnowledgeSpace,
  KnowledgeSpaceKind,
  ResolvedUser,
} from "./domain/identity.js";
export { canIdentify } from "./domain/identity.js";
export {
  createResolveAccount,
  createResolveUserByChannelAccount,
  type AccountResolution,
  type AccountWithSpace,
  type ResolveAccount,
  type IdentityRepository,
  type ResolveUserByChannelAccount,
} from "./application/resolve-user.js";
export { createPgIdentityRepository } from "./infrastructure/pg-identity-repository.js";
export {
  WHATSAPP_PROVIDER,
  createLinkWhatsAppNumber,
  type LinkResult,
  type LinkWhatsAppNumber,
  type WhatsAppAccountRepository,
  type WhatsAppAccountRow,
} from "./application/link-whatsapp-number.js";
export { createPgWhatsAppAccountRepository } from "./infrastructure/pg-whatsapp-account-repository.js";
export { CODE_TTL_MS, MAX_ATTEMPTS, formatCode } from "./domain/verification.js";
export {
  createIssueVerificationCode,
  createVerifyAccountCode,
  type IssueVerificationCode,
  type LiveVerification,
  type VerificationRepository,
  type VerifyAccountCode,
  type VerifyOutcome,
} from "./application/verify-account.js";
export { createPgVerificationRepository } from "./infrastructure/pg-verification-repository.js";
