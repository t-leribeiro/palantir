// Autorização de captura de grupos (feature 004: RN-01, RN-02, RN-05, RN-06; D-04 a D-08). A captura é um
// opt-in por grupo, separado da autorização da fonte: revogar a captura não esconde o histórico importado.
import { DomainError } from "../../../shared/index.js";
import { importConversationId, type ImportOwner, type ImportSourceRepository } from "./ensure-import-source.js";

export const CAPTURE_PROVIDER = "whatsapp";
export const CONSENT_MIN_LENGTH = 10;
export const CONSENT_MAX_LENGTH = 500;

/** Grupo como o número de captura o vê (sem pessoas nem mensagens). */
export interface GroupSnapshot {
  readonly groupId: string;
  readonly subject: string;
  readonly participants: number;
}

export interface DirectoryGroup extends GroupSnapshot {
  readonly seenAt: Date;
  readonly leftAt: Date | null;
}

/** Última autorização de captura de cada grupo (ativa ou revogada). */
export interface CaptureRecord {
  readonly groupId: string;
  readonly sourceId: string;
  readonly sourceTitle: string;
  readonly authorizedAt: Date;
  readonly revokedAt: Date | null;
}

/** Para onde vai uma mensagem do grupo: a fonte autorizada do dono, com o id de conversa dela. */
export interface CaptureRoute {
  readonly provider: string;
  readonly accountId: string;
  readonly conversationId: string;
  readonly sourceId: string;
  readonly authorizedAt: Date;
}

export interface GroupDirectory {
  upsert(groups: readonly GroupSnapshot[], seenAt: Date): Promise<void>;
  /** Marca como "saiu" os grupos que não estão em `present` (lista completa do número). */
  markMissingAsLeft(present: readonly string[], at: Date): Promise<void>;
  list(): Promise<readonly DirectoryGroup[]>;
}

export interface CaptureRepository {
  latestByGroup(provider: string): Promise<readonly CaptureRecord[]>;
  route(provider: string, groupId: string): Promise<CaptureRoute | null>;
  findOwnedSource(userId: string, provider: string, conversationId: string): Promise<{ sourceId: string; title: string } | null>;
  create(input: {
    readonly sourceId: string;
    readonly provider: string;
    readonly groupId: string;
    readonly authorizedBy: string;
    readonly consent: string;
  }): Promise<{ authorizedAt: Date }>;
  revoke(provider: string, groupId: string, at: Date): Promise<boolean>;
}

export type CaptureStatus =
  | { readonly kind: "not_authorized" }
  | { readonly kind: "authorized"; readonly sourceTitle: string; readonly since: Date }
  | { readonly kind: "revoked"; readonly at: Date };

export interface GroupListing {
  readonly updatedAt: Date | null;
  readonly groups: readonly (DirectoryGroup & { readonly position: number; readonly status: CaptureStatus })[];
}

export interface AuthorizeCaptureInput {
  readonly owner: ImportOwner;
  readonly group: string;
  readonly consent: string;
  readonly conversation?: string;
  /** Confirma ligar o grupo a uma conversa de nome diferente (ex.: o grupo foi renomeado). */
  readonly confirmNameMismatch?: boolean;
}

export interface AuthorizeCaptureResult {
  readonly subject: string;
  readonly sourceTitle: string;
  readonly linkedToImport: boolean;
  readonly authorizedAt: Date;
}

/** Ordem estável da listagem: nome do grupo e, em empate, o id. O número de cada linha vem dela. */
export function sortGroups<T extends GroupSnapshot>(groups: readonly T[]): T[] {
  return [...groups].sort((a, b) => a.subject.localeCompare(b.subject, "pt-BR") || (a.groupId < b.groupId ? -1 : 1));
}

/** `<grupo>` do comando: número da listagem (até 4 dígitos) ou id do grupo, com ou sem `@g.us`. */
export function resolveGroupRef<T extends GroupSnapshot>(sorted: readonly T[], ref: string): T {
  const value = ref.trim();
  const byPosition = /^\d{1,4}$/.test(value) ? sorted[Number(value) - 1] : undefined;
  const id = value.endsWith("@g.us") ? value : `${value}@g.us`;
  const found = byPosition ?? sorted.find((g) => g.groupId === id);
  if (!found) throw new DomainError("group_not_found", "Grupo não encontrado. Rode `npm run whatsapp:grupos` para ver a lista atual.");
  return found;
}

export function validateConsent(consent: string | undefined): string {
  const text = consent?.trim() ?? "";
  if (text.length < CONSENT_MIN_LENGTH || text.length > CONSENT_MAX_LENGTH) {
    throw new DomainError(
      "consent_invalid",
      `Informe --consentimento com ${CONSENT_MIN_LENGTH} a ${CONSENT_MAX_LENGTH} caracteres: como os participantes foram avisados e consentiram.`,
    );
  }
  return text;
}

/**
 * Trava contra autorizar o grupo errado: com `--conversa`, o nome do grupo e o da conversa importada precisam
 * coincidir (sem diferença de maiúsculas, acentos e pontuação), a menos que o operador confirme.
 */
export function assertSameConversation(
  group: { readonly position: number; readonly subject: string },
  conversation: string | undefined,
  confirmed: boolean,
): void {
  if (conversation === undefined || confirmed) return;
  const slug = (name: string) => importConversationId(name);
  if (slug(group.subject) === slug(conversation)) return;
  throw new DomainError(
    "name_mismatch",
    `O grupo ${group.position} é "${group.subject}", mas a conversa é "${conversation}". Confira o número na lista; se é isso mesmo (por exemplo, o grupo mudou de nome), repita com --confirmar.`,
  );
}

function statusOf(record: CaptureRecord | undefined): CaptureStatus {
  if (!record) return { kind: "not_authorized" };
  if (record.revokedAt) return { kind: "revoked", at: record.revokedAt };
  return { kind: "authorized", sourceTitle: record.sourceTitle, since: record.authorizedAt };
}

export interface CaptureAdminDeps {
  readonly directory: GroupDirectory;
  readonly captures: CaptureRepository;
  readonly sources: ImportSourceRepository;
  readonly now?: () => Date;
}

export function createCaptureAdmin(deps: CaptureAdminDeps) {
  const now = deps.now ?? (() => new Date());

  async function list(): Promise<GroupListing> {
    const groups = sortGroups(await deps.directory.list());
    const latest = new Map((await deps.captures.latestByGroup(CAPTURE_PROVIDER)).map((r) => [r.groupId, r]));
    const seen = groups.map((g) => g.seenAt.getTime());
    return {
      updatedAt: seen.length > 0 ? new Date(Math.max(...seen)) : null,
      groups: groups.map((g, i) => ({ ...g, position: i + 1, status: statusOf(latest.get(g.groupId)) })),
    };
  }

  async function targetSource(input: AuthorizeCaptureInput, group: GroupSnapshot): Promise<{ sourceId: string; title: string }> {
    if (input.conversation !== undefined) {
      const conversationId = importConversationId(input.conversation);
      const found = await deps.captures.findOwnedSource(input.owner.userId, CAPTURE_PROVIDER, conversationId);
      if (!found) throw new DomainError("conversation_not_found", `Não há conversa importada com o nome "${input.conversation}" para este dono.`);
      return found;
    }
    const account = await deps.sources.ensurePendingAccount(input.owner.userId, CAPTURE_PROVIDER, `unlinked:${input.owner.userId}`);
    const created = await deps.sources.ensureAuthorizedSource({
      spaceId: input.owner.spaceId,
      accountRowId: account.accountRowId,
      conversationId: group.groupId,
      title: group.subject,
    });
    return { sourceId: created.sourceId, title: group.subject };
  }

  async function authorize(input: AuthorizeCaptureInput): Promise<AuthorizeCaptureResult> {
    const consent = validateConsent(input.consent);
    const listing = await list();
    const group = resolveGroupRef(listing.groups, input.group);
    if (group.leftAt) throw new DomainError("group_left", "O número de captura não participa mais deste grupo.");
    assertSameConversation(group, input.conversation, input.confirmNameMismatch === true);
    if (group.status.kind === "authorized") {
      throw new DomainError("already_authorized", `O grupo já está autorizado desde ${group.status.since.toISOString()}. Para trocar a fonte, revogue e autorize de novo.`);
    }
    const source = await targetSource(input, group);
    const created = await deps.captures.create({
      sourceId: source.sourceId,
      provider: CAPTURE_PROVIDER,
      groupId: group.groupId,
      authorizedBy: input.owner.userId,
      consent,
    });
    return { subject: group.subject, sourceTitle: source.title, linkedToImport: input.conversation !== undefined, authorizedAt: created.authorizedAt };
  }

  async function revoke(ref: string): Promise<{ subject: string }> {
    const listing = await list();
    const group = resolveGroupRef(listing.groups, ref);
    const revoked = group.status.kind === "authorized" && (await deps.captures.revoke(CAPTURE_PROVIDER, group.groupId, now()));
    if (!revoked) throw new DomainError("not_authorized", "O grupo não está autorizado.");
    return { subject: group.subject };
  }

  return { list, authorize, revoke };
}

export type CaptureAdmin = ReturnType<typeof createCaptureAdmin>;

/** Roteamento por mensagem, sem cache: a revogação vale na próxima mensagem (RF-08, D-05). */
export function createRouteGroup(captures: CaptureRepository) {
  return (groupId: string): Promise<CaptureRoute | null> => captures.route(CAPTURE_PROVIDER, groupId);
}

/** Diretório de grupos mantido pelo processo do WhatsApp (D-07). Lista completa marca quem saiu. */
export function createSyncGroupDirectory(directory: GroupDirectory, now: () => Date = () => new Date()) {
  return async (groups: readonly GroupSnapshot[], complete: boolean): Promise<void> => {
    const at = now();
    await directory.upsert(groups, at);
    if (complete) await directory.markMissingAsLeft(groups.map((g) => g.groupId), at);
  };
}
