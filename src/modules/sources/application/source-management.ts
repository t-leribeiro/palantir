// Gestão de fontes conversando com o agente (feature 006: D-03, D-04, D-06, D-19; RN-03 a RN-05, RN-09).
// Envolve a autorização de captura da S3: as regras de consentimento e de ligação com a importação são as mesmas
// para o agente e para o terminal.
import { DomainError } from "../../../shared/index.js";
import type { AuditChannel, AuditLog } from "./audit.js";
import { CAPTURE_PROVIDER, type CaptureAdmin, type CaptureRecord, type CaptureRepository, type DirectoryGroup, type GroupDirectory } from "./capture-authorization.js";
import { importConversationId, type ImportOwner } from "./ensure-import-source.js";

export type ManagedState = "following" | "stopped" | "not_following" | "imported" | "conversation" | "other_account";

export interface ManagedItem {
  /** `group:<id do grupo>` ou `source:<uuid>`: estável entre listas. */
  readonly ref: string;
  readonly title: string;
  readonly state: ManagedState;
}

/** Fonte do espaço, fora as em exclusão. */
export interface SpaceSource {
  readonly id: string;
  readonly title: string;
  readonly conversationId: string;
}

export interface SpaceSourceRepository {
  listForSpace(spaceId: string): Promise<readonly SpaceSource[]>;
}

export type FollowCheck =
  | { readonly kind: "ok"; readonly title: string; readonly linksImport: boolean }
  | { readonly kind: "already_following"; readonly title: string; readonly since: Date }
  | { readonly kind: "not_a_group"; readonly title: string }
  | { readonly kind: "left_group"; readonly title: string }
  | { readonly kind: "other_account"; readonly title: string }
  | { readonly kind: "not_found" };

export type StopResult =
  | { readonly kind: "stopped"; readonly title: string }
  | { readonly kind: "not_following"; readonly title: string }
  | { readonly kind: "other_account"; readonly title: string }
  | { readonly kind: "not_found" };

export type DeletionTarget =
  | { readonly kind: "ok"; readonly sourceId: string; readonly title: string }
  | { readonly kind: "nothing_stored"; readonly title: string }
  | { readonly kind: "other_account"; readonly title: string }
  | { readonly kind: "not_found" };

export interface SourceManagementDeps {
  readonly directory: GroupDirectory;
  readonly captures: CaptureRepository;
  readonly admin: CaptureAdmin;
  readonly spaceSources: SpaceSourceRepository;
  readonly audit: AuditLog;
  readonly now?: () => Date;
}

/** Declaração gravada na autorização vinda do agente (D-05). */
export function consentStatement(at: Date): string {
  return `Participantes informados e de acordo; confirmado pelo dono pelo agente em ${at.toISOString().slice(0, 10)}`;
}

const groupRef = (groupId: string) => `group:${groupId}`;
const sourceRef = (sourceId: string) => `source:${sourceId}`;
const isImport = (s: SpaceSource) => s.conversationId.startsWith("export:");

function groupState(record: CaptureRecord | undefined, mine: ReadonlySet<string>): ManagedState {
  if (!record) return "not_following";
  if (!mine.has(record.sourceId)) return record.revokedAt ? "not_following" : "other_account";
  return record.revokedAt ? "stopped" : "following";
}

function sortItems(items: ManagedItem[]): ManagedItem[] {
  return items.sort((a, b) => a.title.localeCompare(b.title, "pt-BR") || (a.ref < b.ref ? -1 : 1));
}

export function createSourceManagement(deps: SourceManagementDeps) {
  const now = deps.now ?? (() => new Date());

  interface View {
    readonly groups: ReadonlyMap<string, DirectoryGroup>;
    readonly records: ReadonlyMap<string, CaptureRecord>;
    readonly sources: ReadonlyMap<string, SpaceSource>;
  }

  async function view(owner: ImportOwner): Promise<View> {
    const [groups, records, sources] = await Promise.all([
      deps.directory.list(),
      deps.captures.latestByGroup(CAPTURE_PROVIDER),
      deps.spaceSources.listForSpace(owner.spaceId),
    ]);
    return {
      groups: new Map(groups.filter((g) => !g.leftAt).map((g) => [g.groupId, g])),
      records: new Map(records.map((r) => [r.groupId, r])),
      sources: new Map(sources.map((s) => [s.id, s])),
    };
  }

  function itemsOf(v: View): ManagedItem[] {
    const mine = new Set(v.sources.keys());
    const linked = new Set<string>();
    const groups = [...v.groups.values()].map((g): ManagedItem => {
      const record = v.records.get(g.groupId);
      if (record && mine.has(record.sourceId)) linked.add(record.sourceId);
      return { ref: groupRef(g.groupId), title: g.subject, state: groupState(record, mine) };
    });
    const sources = [...v.sources.values()]
      .filter((s) => !linked.has(s.id))
      .map((s): ManagedItem => ({ ref: sourceRef(s.id), title: s.title, state: isImport(s) ? "imported" : "conversation" }));
    return sortItems([...groups, ...sources]);
  }

  async function list(owner: ImportOwner): Promise<readonly ManagedItem[]> {
    return itemsOf(await view(owner));
  }

  /** Nomes das fontes do espaço, para o filtro por grupo na pergunta (D-14). */
  async function catalog(spaceId: string): Promise<readonly { readonly sourceId: string; readonly title: string }[]> {
    return (await deps.spaceSources.listForSpace(spaceId)).map((s) => ({ sourceId: s.id, title: s.title }));
  }

  function importToLink(v: View, title: string): SpaceSource | undefined {
    const linkedSources = new Set([...v.records.values()].filter((r) => !r.revokedAt).map((r) => r.sourceId));
    const slug = importConversationId(title);
    return [...v.sources.values()].find((s) => s.conversationId === slug && !linkedSources.has(s.id));
  }

  async function checkFollow(owner: ImportOwner, ref: string): Promise<FollowCheck> {
    const v = await view(owner);
    const item = itemsOf(v).find((i) => i.ref === ref);
    if (!item) return { kind: "not_found" };
    if (!ref.startsWith("group:")) return { kind: "not_a_group", title: item.title };
    const record = v.records.get(ref.slice("group:".length));
    if (item.state === "following" && record) return { kind: "already_following", title: item.title, since: record.authorizedAt };
    if (item.state === "other_account") return { kind: "other_account", title: item.title };
    const previous = record && v.sources.get(record.sourceId);
    return { kind: "ok", title: item.title, linksImport: !previous && importToLink(v, item.title) !== undefined };
  }

  /** Conversa à qual ligar o grupo: a da autorização anterior, se era importada, ou a importação de mesmo nome. */
  function conversationFor(v: View, groupId: string, title: string): string | undefined {
    const record = v.records.get(groupId);
    const previous = record && v.sources.get(record.sourceId);
    if (previous) return isImport(previous) ? previous.title : undefined;
    return importToLink(v, title)?.title;
  }

  async function follow(owner: ImportOwner, ref: string, channel: AuditChannel): Promise<FollowCheck> {
    const check = await checkFollow(owner, ref);
    if (check.kind !== "ok") return check;
    const v = await view(owner);
    const groupId = ref.slice("group:".length);
    const conversation = conversationFor(v, groupId, check.title);
    await deps.admin.authorize({
      owner,
      group: groupId,
      consent: consentStatement(now()),
      ...(conversation === undefined ? {} : { conversation, confirmNameMismatch: true }),
    });
    const record = (await deps.captures.latestByGroup(CAPTURE_PROVIDER)).find((r) => r.groupId === groupId);
    if (!record) throw new DomainError("capture_missing", "A autorização não foi gravada.");
    await deps.audit.record({ actorUserId: owner.userId, action: "capture.authorized", targetKind: "source", targetId: record.sourceId, channel });
    return check;
  }

  async function stop(owner: ImportOwner, ref: string, channel: AuditChannel): Promise<StopResult> {
    const v = await view(owner);
    const item = itemsOf(v).find((i) => i.ref === ref);
    if (!item) return { kind: "not_found" };
    if (item.state === "other_account") return { kind: "other_account", title: item.title };
    const groupId = ref.startsWith("group:") ? ref.slice("group:".length) : undefined;
    const record = groupId === undefined ? undefined : v.records.get(groupId);
    if (item.state !== "following" || !groupId || !record) return { kind: "not_following", title: item.title };
    await deps.admin.revoke(groupId);
    await deps.audit.record({ actorUserId: owner.userId, action: "capture.revoked", targetKind: "source", targetId: record.sourceId, channel });
    return { kind: "stopped", title: item.title };
  }

  /** A fonte que "apagar <ref>" apaga: a do grupo (se algo foi guardado) ou a própria conversa. */
  async function deletionTarget(owner: ImportOwner, ref: string): Promise<DeletionTarget> {
    const v = await view(owner);
    const item = itemsOf(v).find((i) => i.ref === ref);
    if (!item) return { kind: "not_found" };
    if (item.state === "other_account") return { kind: "other_account", title: item.title };
    if (ref.startsWith("source:")) return { kind: "ok", sourceId: ref.slice("source:".length), title: item.title };
    const record = v.records.get(ref.slice("group:".length));
    const source = record && v.sources.get(record.sourceId);
    return source ? { kind: "ok", sourceId: source.id, title: item.title } : { kind: "nothing_stored", title: item.title };
  }

  return { list, catalog, checkFollow, follow, stop, deletionTarget };
}

export type SourceManagement = ReturnType<typeof createSourceManagement>;
