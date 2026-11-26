// Auditoria da gestão de contas e fontes (feature 006, D-13; RN-07, RF-09). Sem nomes, telefones nem texto:
// o alvo é um id, e os detalhes só aceitam contagens.
import { DomainError } from "../../../shared/index.js";

export type AuditAction =
  | "account.link_requested"
  | "account.verified"
  | "account.verification_locked"
  | "capture.authorized"
  | "capture.revoked"
  | "source.deletion_requested"
  | "source.deleted"
  /** Feature 009 (D-17): guardar e esquecer um item, com o id do item como alvo e sem tema nem conteúdo. */
  | "knowledge.item_saved"
  | "knowledge.item_forgotten";

export type AuditChannel = "whatsapp" | "fake" | "cli";
export type AuditTargetKind = "channel_account" | "source" | "knowledge_item";

export interface AuditEvent {
  /** `null` para ações do sistema (ex.: conclusão da exclusão). */
  readonly actorUserId: string | null;
  readonly action: AuditAction;
  readonly targetKind: AuditTargetKind;
  readonly targetId: string;
  readonly channel?: AuditChannel;
  /** Só contagens: nunca nome, telefone ou texto. */
  readonly details?: Readonly<Record<string, number>>;
}

export interface AuditEntry extends Required<Omit<AuditEvent, "channel">> {
  readonly channel: AuditChannel | null;
  readonly at: Date;
  /** Nome da fonte ou número da conta enquanto o alvo existir; `null` depois da exclusão. */
  readonly targetLabel: string | null;
}

export interface AuditLog {
  record(event: AuditEvent): Promise<void>;
  list(query: { readonly since?: Date; readonly limit: number }): Promise<readonly AuditEntry[]>;
}

/** Recusa detalhe que não seja contagem inteira e não negativa (defesa contra conteúdo na auditoria). */
export function assertCountsOnly(details: Readonly<Record<string, unknown>> = {}): void {
  for (const value of Object.values(details)) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new DomainError("audit_details_invalid", "A auditoria só guarda contagens.");
    }
  }
}
