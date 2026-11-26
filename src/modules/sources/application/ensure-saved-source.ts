// A fonte Guardados de cada espaço (feature 009, D-08, D-15): uma por espaço, autorizada, criada no primeiro
// "guarda em X". Ela fica na conta do canal de onde veio o primeiro pedido; a mensagem guardada é ingerida com o
// provedor, a conta e a conversa da própria fonte, para a ingestão resolvê-la como qualquer outra.

export const SAVED_CONVERSATION_ID = "palantir:guardados";
export const SAVED_SOURCE_TITLE = "Guardados";

/** A fonte Guardados como a ingestão a resolve: provedor, conta externa e conversa. */
export interface SavedSourceRef {
  readonly sourceId: string;
  readonly provider: string;
  readonly accountId: string;
  readonly conversationId: string;
}

export interface SavedSourceRepository {
  /** A fonte Guardados do espaço, se existir (em qualquer conta). */
  find(spaceId: string): Promise<SavedSourceRef | null>;
  /** Cria na conta ativa do dono no canal; `null` se outra criação ganhou a corrida (unicidade por espaço). */
  create(input: { readonly spaceId: string; readonly provider: string; readonly externalAccountId: string }): Promise<SavedSourceRef | null>;
}

export type EnsureSavedSource = (input: { readonly spaceId: string; readonly provider: string; readonly externalAccountId: string }) => Promise<SavedSourceRef>;

export function createEnsureSavedSource(repo: SavedSourceRepository): EnsureSavedSource {
  return async (input) => {
    const existing = await repo.find(input.spaceId);
    if (existing) return existing;
    const created = (await repo.create(input)) ?? (await repo.find(input.spaceId));
    if (!created) throw new Error("A fonte Guardados não foi criada: a conta do canal não está ativa neste espaço.");
    return created;
  };
}
