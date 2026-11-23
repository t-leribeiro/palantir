import { decideIngestion, type IngestDecision, type Source } from "../domain/source.js";

export interface SourceRef {
  readonly provider: string;
  readonly accountId: string;
  readonly conversationId: string;
}

export interface SourceRepository {
  findByConversation(ref: SourceRef): Promise<Source | null>;
}

export type IsSourceAuthorized = (ref: SourceRef) => Promise<IngestDecision>;

export function createIsSourceAuthorized(repo: SourceRepository): IsSourceAuthorized {
  return async (ref) => decideIngestion(await repo.findByConversation(ref));
}
