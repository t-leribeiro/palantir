export type {
  ChannelAccount,
  ChannelAccountStatus,
  KnowledgeSpace,
  KnowledgeSpaceKind,
  ResolvedUser,
} from "./domain/identity.js";
export { canIdentify } from "./domain/identity.js";
export {
  createResolveUserByChannelAccount,
  type AccountWithSpace,
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
