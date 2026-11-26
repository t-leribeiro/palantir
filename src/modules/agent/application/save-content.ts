// Guardar com tema no agente (feature 009, D-07, D-14; interfaces/comandos-guardar.md §2 e §3). O agente decide o
// que guardar (a citada, o que espera ou o texto depois de ":") e o tipo aceito; quem grava é a porta `SaveContent`,
// composta em `src/main` sobre a ingestão, a mídia e o `knowledge`.
import type { AgentReply, CanonicalMessage } from "../../../contracts/channel/knowledge-channel.js";
import { UNTITLED_THEME, parseTheme } from "../../knowledge/index.js";
import { info } from "../domain/management-replies.js";
import { MAX_ITEMS_PER_SAVE, SAVE_TEXT, composeSaveReply, type SaveSummary } from "../domain/saved-replies.js";
import type { SaveCommand } from "../domain/save-command.js";
import type { PendingForwards } from "./pending-forwards.js";

/** Dono verificado, canal e conta de onde veio a mensagem. */
export interface SaveContext {
  readonly userId: string;
  readonly spaceId: string;
  readonly provider: string;
  readonly accountId: string;
}

export type SaveItemOutcome = "saved" | "duplicate" | "no_caption" | "unsupported" | "media_off" | "failed";
export type SavedKind = "text" | "audio" | "caption";

export type StoredOutcome = Exclude<SaveItemOutcome, "no_caption" | "unsupported">;

/**
 * Grava uma mensagem na fonte Guardados com o tema (D-08); o tipo já foi aceito pelo agente. Devolve o resultado e,
 * quando guardou ou já estava, o nome do tema como foi gravado na primeira vez (RN-03).
 */
export interface SaveContentPort {
  save(input: { readonly context: SaveContext; readonly theme: string; readonly message: CanonicalMessage }): Promise<StoredOutcome | { readonly outcome: StoredOutcome; readonly theme: string }>;
  /**
   * A citada que já saiu da memória (passou dos 10 min), procurada entre os guardados pelo id original e montada
   * como mensagem a partir do pedido (`request`). `null` quando nunca foi guardada.
   */
  findSaved?(context: SaveContext, externalMessageId: string, request: CanonicalMessage): Promise<CanonicalMessage | null>;
}

/** Métricas sem conteúdo nem tema (D-18). */
export interface SaveObserver {
  saved(outcome: SaveItemOutcome | "asked_theme" | "nothing_pending" | "not_found", kind?: SavedKind): void;
  forwarded(outcome: "noticed" | "queued" | "saved" | "untitled" | "discarded", count?: number): void;
}

const NOOP_OBSERVER: SaveObserver = { saved: () => undefined, forwarded: () => undefined };

export const pendingKey = (ctx: Pick<SaveContext, "userId" | "provider">): string => `${ctx.userId}:${ctx.provider}`;

/** O tipo aceito da mensagem (RN-11), ou o motivo de não guardar. */
export function classify(message: CanonicalMessage): SavedKind | "no_caption" | "unsupported" {
  const hasText = (message.text?.trim() ?? "") !== "";
  if (message.kind === "text" || message.kind === "link") return hasText ? "text" : "unsupported";
  if (message.kind === "audio") return "audio";
  if (message.kind === "image" || message.kind === "document") return hasText ? "caption" : "no_caption";
  return "unsupported";
}

/**
 * Leva de textos comuns (decisão da demonstração, 2026-11-26): o que chega junto, até `windowMs` pela hora da
 * mensagem, espera o pedido como um encaminhado. O texto sozinho espera `settleMs` antes de virar pergunta, para a
 * leva ter tempo de chegar. `windowMs = 0` desliga (canal de teste).
 */
export interface BurstOptions {
  readonly windowMs: number;
  readonly settleMs: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Quanto o texto sozinho espera antes de virar pergunta, com a leva ligada (`PALANTIR_WHATSAPP_BURST_MS`). */
export const BURST_SETTLE_MS = 1_500;

export interface SaveDeps {
  readonly pending: PendingForwards<SaveContext>;
  readonly content: SaveContentPort;
  readonly observer?: SaveObserver;
  readonly burst?: BurstOptions;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Counts = { -readonly [K in keyof Omit<SaveSummary, "theme">]: number };
const FIELD: Record<SaveItemOutcome, keyof Counts> = {
  saved: "saved",
  duplicate: "duplicates",
  no_caption: "noCaption",
  unsupported: "unsupported",
  media_off: "mediaOff",
  failed: "failed",
};

export function createSaveContent(deps: SaveDeps) {
  const observer = deps.observer ?? NOOP_OBSERVER;
  const burst = { windowMs: deps.burst?.windowMs ?? 0, settleMs: deps.burst?.settleMs ?? 0, sleep: deps.burst?.sleep ?? defaultSleep };

  async function saveOne(context: SaveContext, theme: string, message: CanonicalMessage): Promise<{ outcome: SaveItemOutcome; theme?: string }> {
    const kind = classify(message);
    if (kind === "no_caption" || kind === "unsupported") {
      observer.saved(kind);
      return { outcome: kind };
    }
    const result = await deps.content.save({ context, theme, message }).catch(() => "failed" as const);
    const stored = typeof result === "string" ? { outcome: result } : result;
    observer.saved(stored.outcome, kind);
    return stored;
  }

  /** Guarda as mensagens em ordem, até 20; o resto é contado como acima do limite. */
  async function saveAll(context: SaveContext, theme: string, messages: readonly CanonicalMessage[]): Promise<SaveSummary> {
    const counts: Counts = { saved: 0, duplicates: 0, noCaption: 0, unsupported: 0, mediaOff: 0, failed: 0, overflow: 0 };
    let shown = theme;
    for (const message of messages.slice(0, MAX_ITEMS_PER_SAVE)) {
      const result = await saveOne(context, theme, message);
      counts[FIELD[result.outcome]] += 1;
      if (result.theme) shown = result.theme;
    }
    counts.overflow = Math.max(0, messages.length - MAX_ITEMS_PER_SAVE);
    if (counts.saved > 0) observer.forwarded("saved", counts.saved);
    return { theme: shown, ...counts };
  }

  /** A citada: na memória (10 min) ou, depois disso, entre os guardados. */
  async function findQuoted(context: SaveContext, quotedId: string, request: CanonicalMessage): Promise<CanonicalMessage | null> {
    const key = pendingKey(context);
    const inMemory = deps.pending.take(key, quotedId) ?? deps.pending.takeRecent(key, quotedId);
    if (inMemory || !deps.content.findSaved) return inMemory;
    return deps.content.findSaved(context, quotedId, request).catch(() => null);
  }

  /** O que esperava, ou só a citada; a resposta pronta quando não há o que guardar. */
  async function pickPending(context: SaveContext, request: CanonicalMessage, quotedId: string | undefined): Promise<{ readonly messages: readonly CanonicalMessage[] } | { readonly reply: AgentReply }> {
    const key = pendingKey(context);
    if (quotedId) {
      const quoted = await findQuoted(context, quotedId, request);
      if (quoted) return { messages: [quoted] };
      observer.saved("not_found");
      return { reply: info(SAVE_TEXT.quotedNotFound) };
    }
    const all = deps.pending.takeAll(key);
    if (all.length > 0) return { messages: all };
    observer.saved("nothing_pending");
    return { reply: info(SAVE_TEXT.nothingToSave) };
  }

  /** `inline` é o texto depois de ":"; sem ele, vale a citada (`quotedId`) ou tudo o que espera. */
  async function save(context: SaveContext, themeText: string, request: CanonicalMessage, from: { readonly inline?: string; readonly quotedId?: string }): Promise<AgentReply> {
    const theme = parseTheme(themeText);
    if (theme === "too_long") return info(SAVE_TEXT.themeTooLong);
    if (theme === "empty") return askTheme(context);
    if (from.inline !== undefined) return composeSaveReply(await saveAll(context, theme.name, [{ ...request, kind: "text", text: from.inline }]));
    const picked = await pickPending(context, request, from.quotedId);
    if ("reply" in picked) return picked.reply;
    return composeSaveReply(await saveAll(context, theme.name, picked.messages));
  }

  function askTheme(context: SaveContext): AgentReply {
    if (!deps.pending.markAwaitingTheme(pendingKey(context))) {
      observer.saved("nothing_pending");
      return info(SAVE_TEXT.nothingToSave);
    }
    observer.saved("asked_theme");
    return info(SAVE_TEXT.askTheme);
  }

  return {
    /** Encaminhado ou mídia: espera o pedido. Só o primeiro de uma leva recebe o aviso; os outros, nada. */
    hold(context: SaveContext, message: CanonicalMessage): AgentReply | null {
      const added = deps.pending.add(pendingKey(context), context, message);
      if (!added.accepted) return null;
      observer.forwarded(added.opened ? "noticed" : "queued");
      return added.opened ? info(SAVE_TEXT.received) : null;
    },
    /**
     * Texto comum, antes de virar pergunta: entra numa leva (o primeiro da leva recebe o aviso; os outros, nada) ou
     * fica na memória para poder ser citado. `undefined` quando segue como pergunta.
     */
    async screen(context: SaveContext, message: CanonicalMessage): Promise<AgentReply | null | undefined> {
      const key = pendingKey(context);
      const noted = deps.pending.noteText(key, context, message, burst.windowMs);
      if (noted.batched) {
        observer.forwarded(noted.opened ? "noticed" : "queued");
        return noted.opened ? info(SAVE_TEXT.received) : null;
      }
      const id = message.source.externalMessageId;
      if (burst.windowMs === 0 || burst.settleMs === 0 || !id) return undefined;
      await burst.sleep(burst.settleMs);
      return deps.pending.isLoose(key, id) ? undefined : null;
    },
    /** O pedido de guardar (RN-01). */
    run(context: SaveContext, command: SaveCommand, request: CanonicalMessage): Promise<AgentReply> {
      if (command.kind === "ask_theme") return Promise.resolve(askTheme(context));
      const quotedId = request.quotedExternalMessageId;
      return save(context, command.theme, request, { ...(command.content === undefined ? {} : { inline: command.content }), ...(quotedId ? { quotedId } : {}) });
    },
    /** O dono pediu "guarda isso" e esta mensagem pode ser o tema (D-14)? */
    awaitingTheme: (context: SaveContext): boolean => deps.pending.awaitingTheme(pendingKey(context)),
    /** A resposta de tema: guarda tudo o que aguardava com esse tema. */
    answerTheme: (context: SaveContext, text: string, request: CanonicalMessage): Promise<AgentReply> => save(context, text, request, {}),
    /** Para a varredura: guarda em "sem tema" o que aguardava tema há 10 min; devolve quantos foram guardados. */
    async untitled(context: SaveContext, messages: readonly CanonicalMessage[]): Promise<number> {
      const summary = await saveAll(context, UNTITLED_THEME, messages);
      if (summary.saved > 0) observer.forwarded("untitled", summary.saved);
      return summary.saved + summary.duplicates;
    },
    /** O aviso de "sem tema", uma vez, antes da próxima resposta. */
    untitledNotice: (context: SaveContext): string | null => (deps.pending.takeUntitledNotice(pendingKey(context)) > 0 ? SAVE_TEXT.untitledNotice : null),
  };
}

export type SaveContentService = ReturnType<typeof createSaveContent>;
