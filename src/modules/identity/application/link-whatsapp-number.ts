// Cadastro do número pessoal por comando do operador (feature 003: RF-03, RN-03, RN-07; D-08).
// Sem código de verificação nesta fatia: a verificação pelo WhatsApp entra na S5.
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
  activate(accountId: string, externalAccountId: string): Promise<void>;
  create(userId: string, externalAccountId: string): Promise<void>;
  countSources(accountId: string): Promise<number>;
}

export interface LinkResult {
  /** `linked`: conta provisória ou nova ativada; `replaced`: número trocado; `unchanged`: nada a fazer. */
  readonly outcome: "linked" | "replaced" | "unchanged";
  readonly phone: string;
  readonly importedSources: number;
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
      await repo.create(userId, phone);
      return { outcome: "linked", phone, importedSources: 0 };
    }
    if (own.externalAccountId === phone && own.status === "active") {
      return { outcome: "unchanged", phone, importedSources: await repo.countSources(own.id) };
    }
    const outcome = own.externalAccountId.startsWith(PROVISIONAL_PREFIX) ? "linked" : "replaced";
    await repo.activate(own.id, phone);
    return { outcome, phone, importedSources: await repo.countSources(own.id) };
  };
}
