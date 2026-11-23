// Importar uma conversa é autorizá-la (RN-01 da S1). A fonte fica na conta `whatsapp` do dono, criada
// sem número e pendente; a S2 vincula o número real (D-10, esclarecimento de 2026-11-23).
import { DomainError } from "../../../shared/index.js";

export const IMPORT_PROVIDER = "whatsapp";

export interface ImportOwner {
  readonly userId: string;
  readonly spaceId: string;
}

export interface ImportSourceRef {
  readonly sourceId: string;
  readonly provider: string;
  readonly accountId: string;
  readonly conversationId: string;
  readonly title: string;
  readonly created: boolean;
}

export interface ImportSourceRepository {
  /** Garante a conta do provedor para o usuário e devolve o id externo dela. */
  ensurePendingAccount(userId: string, provider: string, externalAccountId: string): Promise<{ accountRowId: string; externalAccountId: string }>;
  /** Cria a fonte autorizada ou devolve a existente com o mesmo id de conversa. */
  ensureAuthorizedSource(input: {
    spaceId: string;
    accountRowId: string;
    conversationId: string;
    title: string;
  }): Promise<{ sourceId: string; status: string; created: boolean }>;
}

export type EnsureImportSource = (owner: ImportOwner, title: string) => Promise<ImportSourceRef>;

/** Id estável da conversa importada a partir do nome: "Comunidade DevOps" → "export:comunidade-devops". */
export function importConversationId(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug === "") throw new DomainError("invalid_conversation", "O nome da conversa precisa ter letras ou números.");
  return `export:${slug}`;
}

export function unlinkedAccountId(userId: string): string {
  return `unlinked:${userId}`;
}

export function createEnsureImportSource(repo: ImportSourceRepository): EnsureImportSource {
  return async (owner, title) => {
    const conversationId = importConversationId(title);
    const account = await repo.ensurePendingAccount(owner.userId, IMPORT_PROVIDER, unlinkedAccountId(owner.userId));
    const source = await repo.ensureAuthorizedSource({
      spaceId: owner.spaceId,
      accountRowId: account.accountRowId,
      conversationId,
      title: title.trim(),
    });
    if (source.status === "deleting") {
      throw new DomainError("source_deleting", "Esta conversa está sendo excluída; aguarde a exclusão terminar para importar de novo.");
    }
    return {
      sourceId: source.sourceId,
      provider: IMPORT_PROVIDER,
      accountId: account.externalAccountId,
      conversationId,
      title: title.trim(),
      created: source.created,
    };
  };
}
