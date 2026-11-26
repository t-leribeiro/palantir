// Composição do guardar com tema (feature 009, D-05, D-08, D-13; ADR-0014). O agente decide o que guardar; aqui
// ficam a fonte Guardados, o preparo do áudio pelo `fetchMedia` do canal de origem, a duplicata no tema, a ingestão,
// o item no `knowledge`, a auditoria sem conteúdo e a purga do arquivo esquecido pelo outbox.
import type { CanonicalMessage, IngestOutcome, KnowledgeChannel } from "../contracts/channel/knowledge-channel.js";
import {
  SAVED_AUTHOR,
  createMemoryPendingForwards,
  createPgConversationState,
  createSaveContent,
  createSavedListing,
  type SaveContentPort,
  type SaveContext,
  type SaveObserver,
  type SavedListingObserver,
  type SavedRouting,
} from "../modules/agent/index.js";
import { createPgSavedItems, createSavedItems, normalizeTheme, type SavedItems } from "../modules/knowledge/index.js";
import { PURGE_OBJECT_QUEUE, type PrepareAttachments } from "../modules/media/index.js";
import { createEnsureSavedSource, createPgAuditLog, createPgSavedSourceRepository, type AuditLog, type EnsureSavedSource, type SavedSourceRef } from "../modules/sources/index.js";
import type { AppConfig } from "../platform/config.js";
import type { Pool } from "../platform/db/index.js";
import type { Logger } from "../platform/logging/logger.js";
import type { JobQueue } from "../platform/queue/index.js";
import { withSpan } from "../platform/telemetry/index.js";
import { buildMediaPrepare } from "./media.js";

export interface SavedObservers extends SaveObserver, SavedListingObserver {}

const NOOP_OBSERVERS: SavedObservers = { saved: () => undefined, forwarded: () => undefined, listing: () => undefined };

export interface SavedComposition {
  readonly routing: SavedRouting;
  /** Desliga a varredura da espera. */
  stop(): void;
}

interface SaveParts {
  readonly saved: SavedItems;
  readonly ensure: EnsureSavedSource;
  readonly ingest: (message: CanonicalMessage) => Promise<IngestOutcome>;
  readonly prepare: PrepareAttachments | undefined;
  readonly channel: Pick<KnowledgeChannel, "fetchMedia">;
  readonly audit: AuditLog;
}

const channelOf = (provider: string) => (provider === "whatsapp" ? ("whatsapp" as const) : ("fake" as const));

/**
 * A mensagem como ela entra na fonte Guardados: provedor, conta e conversa da fonte; autor o dono ("Você", D-03);
 * id externo com o tema, para o mesmo conteúdo poder estar em temas diferentes (D-10) e repetir no mesmo tema ser
 * idempotente. A citação do "responder" fica de fora: ela aponta para a conversa com o agente.
 */
export function toSavedMessage(message: CanonicalMessage, source: SavedSourceRef, owner: string, theme: string): CanonicalMessage {
  const { quotedExternalMessageId: _quoted, ...rest } = message;
  const base = message.source.externalMessageId ?? message.id;
  return {
    ...rest,
    source: { provider: source.provider, accountId: source.accountId, conversationId: source.conversationId, externalMessageId: `${base}#${normalizeTheme(theme)}`.slice(0, 200) },
    sender: { externalId: owner, displayName: SAVED_AUTHOR },
    attachments: message.kind === "audio" ? message.attachments : [],
    provenance: { ...message.provenance, captureMethod: "forwarded_to_agent" },
  };
}

/** O áudio baixado, conferido e guardado cifrado; `null` quando não deu para guardar o arquivo. */
async function preparedAudio(parts: SaveParts, message: CanonicalMessage): Promise<CanonicalMessage | null> {
  if (!parts.prepare) return null;
  const prepared = await withSpan("media.prepare", () => (parts.prepare as PrepareAttachments)(message, (ref) => parts.channel.fetchMedia(ref)));
  return prepared.attachments[0]?.status === "stored" ? prepared : null;
}

/** O que identifica o conteúdo na duplicata do tema: o SHA-256 do áudio ou o texto (RN-07). */
function contentKey(message: CanonicalMessage): { sha256?: string; text?: string } {
  const sha256 = message.attachments[0]?.sha256;
  if (message.kind === "audio" && sha256) return { sha256 };
  return message.text === undefined ? {} : { text: message.text };
}

function saveOne(parts: SaveParts): SaveContentPort["save"] {
  return async ({ context, theme, message }) => {
    if (message.kind === "audio" && !parts.prepare) return "media_off";
    const source = await parts.ensure({ spaceId: context.spaceId, provider: context.provider, externalAccountId: context.accountId });
    const draft = toSavedMessage(message, source, context.accountId, theme);
    const ready = draft.kind === "audio" ? await preparedAudio(parts, draft) : draft;
    if (!ready) return "failed";
    if (await parts.saved.isDuplicate(context.spaceId, theme, contentKey(ready))) return { outcome: "duplicate", theme: await parts.saved.displayName(context.spaceId, theme) };
    const outcome = await parts.ingest(ready);
    if (outcome.outcome === "rejected") return "failed";
    const item = await parts.saved.save(context.spaceId, theme, outcome.messageId);
    await parts.audit.record({ actorUserId: context.userId, action: "knowledge.item_saved", targetKind: "knowledge_item", targetId: item.itemId, channel: channelOf(context.provider) });
    return { outcome: "saved", theme: item.theme };
  };
}

/**
 * O guardar de um canal: a porta de gravação com o `fetchMedia` dele, a espera em memória com a varredura e a
 * listagem com o esquecer. Sem mídia configurada, o áudio responde que o armazenamento não está ligado.
 */
export async function buildSaved(
  config: AppConfig,
  pool: Pool,
  queue: JobQueue,
  ingest: SaveParts["ingest"],
  channel: Pick<KnowledgeChannel, "fetchMedia">,
  logger: Logger,
  observer: SavedObservers = NOOP_OBSERVERS,
): Promise<SavedComposition> {
  const store = createPgSavedItems(pool, {
    onOrphanKeys: async (db, keys) => {
      for (const key of keys) await queue.sendInTransaction(db, PURGE_OBJECT_QUEUE, { key });
    },
  });
  const saved = createSavedItems(store);
  const audit = createPgAuditLog(pool);
  const parts: SaveParts = {
    saved,
    ensure: createEnsureSavedSource(createPgSavedSourceRepository(pool)),
    ingest,
    prepare: await buildMediaPrepare(config, pool, logger, "guardar"),
    channel,
    audit,
  };
  const save = saveOne(parts);
  const content: SaveContentPort = { save: (input) => withSpan("agent.save", () => save(input)) };
  let untitled: (context: SaveContext, messages: readonly CanonicalMessage[]) => Promise<number> = async () => 0;
  const pending = createMemoryPendingForwards<SaveContext>({
    onUntitled: (context, messages) => untitled(context, messages),
    observer: { discarded: (count) => observer.forwarded("discarded", count) },
  });
  const service = createSaveContent({ pending, content, observer });
  untitled = (context, messages) => service.untitled(context, messages);
  const state = createPgConversationState(pool);
  const listing = createSavedListing({
    library: saved,
    async forget(ctx, messageId) {
      const result = await saved.forget(ctx.spaceId, messageId);
      if (!result) return null;
      await audit.record({ actorUserId: ctx.userId, action: "knowledge.item_forgotten", targetKind: "knowledge_item", targetId: result.itemId, channel: channelOf(ctx.provider) });
      return { theme: result.theme };
    },
    citations: state,
    state,
    observer,
  });
  return { routing: { save: service, listing }, stop: pending.start() };
}
