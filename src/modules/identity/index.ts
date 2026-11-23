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
