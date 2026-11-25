// Cadastro do número pessoal por comando do operador (feature 003: RF-03, RN-03, RN-07; D-08).
// Desde a S5 (feature 006, D-11, RN-02) o número fica pendente até o dono mandar ao agente o código de verificação.
import { DomainError, normalizePhone } from "../../../shared/index.js";
import type { ChannelAccountStatus } from "../domain/identity.js";

export const WHATSAPP_PROVIDER = "whatsapp";
const PROVISIONAL_PREFIX = "unlinked:";

export interface WhatsAppAccountRow {
  readonly id: string;
  readonly userId: string;
  readonly externalAccountId: string;
  readonly status: ChannelAccountStatus;
}

/** Contas do provedor `whatsapp`. */
export interface WhatsAppAccountRepository {
  findByExternalId(externalAccountId: string): Promise<WhatsAppAccountRow | null>;
  /** A conta WhatsApp do usuário (a ativa, se houver mais de uma). */
  findForUser(userId: string): Promise<WhatsAppAccountRow | null>;
  /** Grava o número e deixa a conta pendente, sem verificação, até o código chegar. */
  setPending(accountId: string, externalAccountId: string): Promise<void>;
  /** Cria a conta pendente e devolve o id. */
  create(userId: string, externalAccountId: string): Promise<string>;
  countSources(accountId: string): Promise<number>;
}

export interface LinkResult {
  /**
   * `linked`: conta provisória ou nova; `replaced`: número trocado; `pending`: mesmo número, ainda sem verificação;
   * `unchanged`: mesmo número, já verificado. Fora `unchanged`, a conta fica pendente até o código.
   */
  readonly outcome: "linked" | "replaced" | "pending" | "unchanged";
  readonly phone: string;
  readonly importedSources: number;
  readonly accountId: string;
  readonly needsVerification: boolean;
}

export type LinkWhatsAppNumber = (userId: string, rawNumber: string) => Promise<LinkResult>;

export function createLinkWhatsAppNumber(repo: WhatsAppAccountRepository): LinkWhatsAppNumber {
  return async (userId, rawNumber) => {
    const phone = normalizePhone(rawNumber);
    if (!phone) throw new DomainError("invalid_phone", "Número inválido. Use o formato internacional, ex.: +55 11 98888-7777.");
    const holder = await repo.findByExternalId(phone);
    // RN-07: não revela quem é o outro usuário.
    if (holder && holder.userId !== userId) throw new DomainError("already_linked", "Este número já está cadastrado.");
    const own = await repo.findForUser(userId);
    if (!own) {
      const accountId = await repo.create(userId, phone);
      return { outcome: "linked", phone, importedSources: 0, accountId, needsVerification: true };
    }
    const importedSources = await repo.countSources(own.id);
    if (own.externalAccountId === phone && own.status === "active") {
      return { outcome: "unchanged", phone, importedSources, accountId: own.id, needsVerification: false };
    }
    const outcome = outcomeFor(own, phone);
    await repo.setPending(own.id, phone);
    return { outcome, phone, importedSources, accountId: own.id, needsVerification: true };
  };
}

function outcomeFor(own: WhatsAppAccountRow, phone: string): "linked" | "replaced" | "pending" {
  if (own.externalAccountId.startsWith(PROVISIONAL_PREFIX)) return "linked";
  return own.externalAccountId === phone ? "pending" : "replaced";
}
