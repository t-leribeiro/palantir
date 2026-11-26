// Comandos de gestão de fontes pelo agente (feature 006: RF-02 a RF-05, RF-08; D-01, D-02, D-05, D-15).
// Só roda para conta ativa e verificada, em conversa direta; o espaço vem da identidade, nunca do texto.
import type { AgentReply } from "../../../contracts/channel/knowledge-channel.js";
import type {
  AuditChannel,
  DeletionTarget,
  FollowCheck,
  RequestDeletionResult,
  StopResult,
} from "../../sources/index.js";
import { normalizeText, parseCommand, type AgentCommand } from "../domain/command.js";
import { ambiguityText, listingPage, resolveRef, type ListItem } from "../domain/conversation-ref.js";
import { MANAGEMENT_TEXT as T, info } from "../domain/management-replies.js";
import { SAVE_TEXT } from "../domain/saved-replies.js";
import type { ConversationStateStore, PendingAction } from "./conversation-state.js";

export const PENDING_TTL_MS = 5 * 60_000;

export interface Owner {
  readonly userId: string;
  readonly spaceId: string;
}

/** Gestão de fontes vista pelo agente (implementada pelo módulo de fontes e composta em `src/main`). */
export interface SourceManagementPort {
  list(owner: Owner): Promise<readonly ListItem[]>;
  checkFollow(owner: Owner, ref: string): Promise<FollowCheck>;
  follow(owner: Owner, ref: string, channel: AuditChannel): Promise<FollowCheck>;
  stop(owner: Owner, ref: string, channel: AuditChannel): Promise<StopResult>;
  deletionTarget(owner: Owner, ref: string): Promise<DeletionTarget>;
  requestDeletion(input: {
    readonly owner: Owner;
    readonly sourceId: string;
    readonly title: string;
    readonly channel: AuditChannel;
    readonly notify: { readonly provider: string; readonly accountId: string };
  }): Promise<RequestDeletionResult>;
}

export interface ManageSourcesDeps {
  readonly sources: SourceManagementPort;
  readonly state: ConversationStateStore;
  readonly now?: () => Date;
}

/** Quem pergunta: dono verificado, canal e conta de onde veio a mensagem. */
export interface ManagementContext extends Owner {
  readonly provider: string;
  readonly accountId: string;
}

const channelOf = (provider: string): AuditChannel => (provider === "whatsapp" ? "whatsapp" : "fake");

function followReply(check: FollowCheck, onOk: (title: string, linksImport: boolean) => string): AgentReply {
  switch (check.kind) {
    case "ok":
      return info(onOk(check.title, check.linksImport));
    case "already_following":
      return info(T.alreadyFollowing(check.title, check.since));
    case "not_a_group":
      return info(T.notAGroup(check.title));
    case "left_group":
      return info(T.leftGroup(check.title));
    case "other_account":
      return info(T.otherAccount);
    case "not_found":
      return info(T.noList);
  }
}

function stopReply(result: StopResult): AgentReply {
  if (result.kind === "stopped") return info(T.stopped(result.title));
  if (result.kind === "not_following") return info(T.notFollowing(result.title));
  return info(result.kind === "other_account" ? T.otherAccount : T.noList);
}

function deletionReply(result: RequestDeletionResult, title: string): AgentReply {
  if (result.outcome === "requested") return info(T.deleting(title));
  if (result.outcome === "already_deleting") return info(T.alreadyDeleting(title));
  return info(T.noList);
}

export function createManageSources(deps: ManageSourcesDeps) {
  const now = deps.now ?? (() => new Date());

  async function list(ctx: ManagementContext): Promise<AgentReply> {
    const items = await deps.sources.list(ctx);
    await deps.state.saveListing(ctx.userId, ctx.provider, { items, page: 1, at: now() });
    return info(listingPage(items, 1).text);
  }

  async function more(ctx: ManagementContext): Promise<AgentReply> {
    const stored = await deps.state.listing(ctx.userId, ctx.provider);
    if (!stored) return info(T.noList);
    const page = stored.page + 1;
    await deps.state.saveListing(ctx.userId, ctx.provider, { ...stored, page });
    return info(listingPage(stored.items, page).text);
  }

  /** O item citado, ou a resposta que explica por que não deu para escolher. */
  async function pick(ctx: ManagementContext, ref: string): Promise<ListItem | AgentReply> {
    const [items, stored] = await Promise.all([deps.sources.list(ctx), deps.state.listing(ctx.userId, ctx.provider)]);
    const resolved = resolveRef(ref, items, stored, now());
    if (resolved.kind === "found") return resolved.item;
    if (resolved.kind === "stale_number") return info(T.staleList(ref));
    if (resolved.kind === "not_found") return info(T.notFound(ref));
    await deps.state.saveListing(ctx.userId, ctx.provider, { items: resolved.candidates, page: 1, at: now() });
    return info(ambiguityText(resolved.candidates));
  }

  async function ask(ctx: ManagementContext, pending: PendingAction): Promise<void> {
    await deps.state.savePending(ctx.userId, ctx.provider, { pending, expiresAt: new Date(now().getTime() + PENDING_TTL_MS) });
  }

  async function follow(ctx: ManagementContext, ref: string): Promise<AgentReply> {
    const item = await pick(ctx, ref);
    if (!("ref" in item)) return item;
    const check = await deps.sources.checkFollow(ctx, item.ref);
    if (check.kind === "ok") await ask(ctx, { action: "follow", ref: item.ref, title: check.title });
    return followReply(check, T.askFollow);
  }

  async function stop(ctx: ManagementContext, ref: string): Promise<AgentReply> {
    const item = await pick(ctx, ref);
    if (!("ref" in item)) return item;
    return stopReply(await deps.sources.stop(ctx, item.ref, channelOf(ctx.provider)));
  }

  async function remove(ctx: ManagementContext, ref: string): Promise<AgentReply> {
    const item = await pick(ctx, ref);
    if (!("ref" in item)) return item;
    const target = await deps.sources.deletionTarget(ctx, item.ref);
    if (target.kind === "ok") {
      await ask(ctx, { action: "delete", ref: item.ref, title: target.title });
      return info(T.askDelete(target.title));
    }
    if (target.kind === "nothing_stored") return info(T.nothingStored(target.title));
    return info(target.kind === "other_account" ? T.otherAccount : T.noList);
  }

  /** A ação pendente no prazo; se venceu, limpa e explica. `null` quando não há nada pendente. */
  async function livePending(ctx: ManagementContext): Promise<PendingAction | AgentReply | null> {
    const stored = await deps.state.pending(ctx.userId, ctx.provider);
    if (!stored) return null;
    if (stored.expiresAt.getTime() > now().getTime()) return stored.pending;
    await deps.state.clearPending(ctx.userId, ctx.provider);
    if (stored.pending.action === "forget") return info(SAVE_TEXT.forgetExpired);
    const verb = stored.pending.action === "follow" ? "acompanhar" : "apagar";
    return info(T.expired(`${verb} ${stored.pending.title}`));
  }

  async function confirm(ctx: ManagementContext): Promise<AgentReply | null> {
    const pending = await livePending(ctx);
    if (!pending || !("action" in pending)) return pending;
    // "esquece a N" (feature 009) confirma pelo serviço dos guardados, que vem depois na ordem do agente.
    if (pending.action === "forget") return null;
    if (pending.action === "delete") return info(T.wrongDeleteName(pending.title));
    if (!(await deps.state.takePending(ctx.userId, ctx.provider, pending.ref, now()))) return info(T.expired(`acompanhar ${pending.title}`));
    return followReply(await deps.sources.follow(ctx, pending.ref, channelOf(ctx.provider)), T.followed);
  }

  async function confirmDelete(ctx: ManagementContext, name: string): Promise<AgentReply> {
    const pending = await livePending(ctx);
    if (!pending) return info(T.nothingPending);
    if (!("action" in pending)) return pending;
    if (pending.action === "forget") return info(T.nothingPending);
    if (pending.action !== "delete" || normalizeText(pending.title) !== normalizeText(name)) return info(T.wrongDeleteName(pending.title));
    if (!(await deps.state.takePending(ctx.userId, ctx.provider, pending.ref, now()))) return info(T.expired(`apagar ${pending.title}`));
    const target = await deps.sources.deletionTarget(ctx, pending.ref);
    if (target.kind !== "ok") return info(T.noList);
    const notify = { provider: ctx.provider, accountId: ctx.accountId };
    const result = await deps.sources.requestDeletion({ owner: ctx, sourceId: target.sourceId, title: pending.title, channel: channelOf(ctx.provider), notify });
    return deletionReply(result, pending.title);
  }

  async function run(ctx: ManagementContext, command: AgentCommand): Promise<AgentReply | null> {
    switch (command.kind) {
      case "list":
        return list(ctx);
      case "more":
        return more(ctx);
      case "follow":
        return follow(ctx, command.ref);
      case "stop":
        return stop(ctx, command.ref);
      case "delete":
        return remove(ctx, command.ref);
      case "confirm":
        return confirm(ctx);
      case "confirm_delete":
        return confirmDelete(ctx, command.name);
    }
  }

  /** A resposta ao comando de gestão, ou `null` quando a mensagem não é comando (segue como pergunta). */
  return async (ctx: ManagementContext, text: string): Promise<AgentReply | null> => {
    const command = parseCommand(text);
    return command ? run(ctx, command) : null;
  };
}

export type ManageSources = ReturnType<typeof createManageSources>;
