// Espera em memória (feature 009, D-05, D-14). Varredura a cada 30 s: o que venceu sem pedido é descartado (só a
// contagem fica); o que aguardava tema há 10 min vai para "sem tema" pelo `onUntitled`. Reiniciar o processo perde
// tudo o que esperava, de propósito: nada do que o dono não pediu toca o disco (ADR-0014).
import type { CanonicalMessage } from "../../../contracts/channel/knowledge-channel.js";
import { PENDING_HARD_LIMIT, PENDING_TTL_MS, type AddResult, type BurstResult, type PendingForwards } from "../application/pending-forwards.js";

export const SWEEP_INTERVAL_MS = 30_000;

interface Entry {
  readonly message: CanonicalMessage;
  readonly at: number;
}

interface Bucket<C> {
  context: C;
  entries: Entry[];
  /** Textos comuns recentes (viraram pergunta), para a leva e o "responder"; somem em 10 min. */
  recent: Entry[];
  /** Tudo o que o dono mandou nos últimos 10 min, guardado ou não, para o "responder" achar (só a citação lê). */
  seen: Entry[];
  awaitingSince: number | undefined;
  untitled: number;
}

export interface PendingSweepObserver {
  discarded(count: number): void;
}

export interface MemoryPendingOptions<C> {
  readonly now?: () => number;
  readonly ttlMs?: number;
  /** Guarda em "sem tema" o que aguardava tema; devolve quantos itens guardou. */
  readonly onUntitled?: (context: C, messages: readonly CanonicalMessage[]) => Promise<number>;
  readonly observer?: PendingSweepObserver;
}

export interface MemoryPendingForwards<C> extends PendingForwards<C> {
  /** Uma passada da varredura (os testes chamam direto). */
  sweep(): Promise<void>;
  /** Liga a varredura periódica sem segurar o processo (`unref`); devolve como desligar. */
  start(intervalMs?: number): () => void;
}

export function createMemoryPendingForwards<C>(options: MemoryPendingOptions<C> = {}): MemoryPendingForwards<C> {
  const now = options.now ?? (() => Date.now());
  const ttl = options.ttlMs ?? PENDING_TTL_MS;
  const buckets = new Map<string, Bucket<C>>();

  const bucketOf = (key: string) => buckets.get(key);
  const dropIfEmpty = (key: string, bucket: Bucket<C>) => {
    if (bucket.entries.length === 0 && bucket.recent.length === 0 && bucket.seen.length === 0 && bucket.untitled === 0) buckets.delete(key);
  };
  const ensure = (key: string, context: C): Bucket<C> => {
    const bucket = bucketOf(key) ?? { context, entries: [], recent: [], seen: [], awaitingSince: undefined, untitled: 0 };
    bucket.context = context;
    buckets.set(key, bucket);
    return bucket;
  };
  const idOf = (entry: Entry) => entry.message.source.externalMessageId;
  const see = (bucket: Bucket<C>, message: CanonicalMessage) => {
    if (bucket.seen.length >= PENDING_HARD_LIMIT) bucket.seen.shift();
    bucket.seen.push({ message, at: now() });
  };

  async function settleAwaiting(key: string, bucket: Bucket<C>): Promise<void> {
    const messages = bucket.entries.map((e) => e.message);
    bucket.entries = [];
    bucket.awaitingSince = undefined;
    const saved = messages.length > 0 && options.onUntitled ? await options.onUntitled(bucket.context, messages).catch(() => 0) : 0;
    bucket.untitled += saved;
    if (saved < messages.length) options.observer?.discarded(messages.length - saved);
    dropIfEmpty(key, bucket);
  }

  function expire(key: string, bucket: Bucket<C>, at: number): void {
    const alive = bucket.entries.filter((e) => at - e.at < ttl);
    const gone = bucket.entries.length - alive.length;
    bucket.entries = alive;
    bucket.recent = bucket.recent.filter((e) => at - e.at < ttl);
    bucket.seen = bucket.seen.filter((e) => at - e.at < ttl);
    if (gone > 0) options.observer?.discarded(gone);
    dropIfEmpty(key, bucket);
  }

  const store: MemoryPendingForwards<C> = {
    add(key, context, message): AddResult {
      const bucket = ensure(key, context);
      const opened = bucket.entries.length === 0;
      if (bucket.entries.length >= PENDING_HARD_LIMIT) {
        options.observer?.discarded(1);
        return { opened: false, accepted: false };
      }
      bucket.entries.push({ message, at: now() });
      if (!bucket.seen.some((e) => e.message === message)) see(bucket, message);
      return { opened, accepted: true };
    },
    takeAll(key) {
      const bucket = bucketOf(key);
      if (!bucket) return [];
      const messages = bucket.entries.map((e) => e.message);
      bucket.entries = [];
      bucket.awaitingSince = undefined;
      dropIfEmpty(key, bucket);
      return messages;
    },
    take(key, externalMessageId) {
      const bucket = bucketOf(key);
      const index = bucket?.entries.findIndex((e) => e.message.source.externalMessageId === externalMessageId) ?? -1;
      if (!bucket || index === -1) return null;
      const [entry] = bucket.entries.splice(index, 1);
      if (bucket.entries.length === 0) bucket.awaitingSince = undefined;
      dropIfEmpty(key, bucket);
      return entry?.message ?? null;
    },
    markAwaitingTheme(key) {
      const bucket = bucketOf(key);
      if (!bucket || bucket.entries.length === 0) return false;
      bucket.awaitingSince = now();
      return true;
    },
    awaitingTheme: (key) => bucketOf(key)?.awaitingSince !== undefined,
    takeUntitledNotice(key) {
      const bucket = bucketOf(key);
      if (!bucket) return 0;
      const count = bucket.untitled;
      bucket.untitled = 0;
      dropIfEmpty(key, bucket);
      return count;
    },
    noteText(key, context, message, windowMs): BurstResult {
      const bucket = ensure(key, context);
      const sent = sentAt(message);
      const close = (entry: Entry) => windowMs > 0 && Math.abs(sentAt(entry.message) - sent) <= windowMs;
      const mates = bucket.recent.filter(close);
      if (mates.length === 0 && !bucket.entries.some(close)) {
        if (bucket.recent.length >= PENDING_HARD_LIMIT) bucket.recent.shift();
        bucket.recent.push({ message, at: now() });
        see(bucket, message);
        return { batched: false, opened: false };
      }
      bucket.recent = bucket.recent.filter((e) => !mates.includes(e));
      const added = [...mates.map((e) => e.message), message].map((m) => store.add(key, context, m));
      return { batched: true, opened: added.some((a) => a.opened) };
    },
    isLoose: (key, externalMessageId) => bucketOf(key)?.recent.some((e) => idOf(e) === externalMessageId) ?? false,
    takeRecent(key, externalMessageId) {
      const bucket = bucketOf(key);
      const entry = bucket?.seen.find((e) => idOf(e) === externalMessageId);
      if (!bucket || !entry) return null;
      bucket.recent = bucket.recent.filter((e) => idOf(e) !== externalMessageId);
      return entry.message;
    },
    async sweep() {
      const at = now();
      for (const [key, bucket] of [...buckets]) {
        if (bucket.awaitingSince === undefined) expire(key, bucket, at);
        else if (at - bucket.awaitingSince >= ttl) await settleAwaiting(key, bucket);
      }
    },
    start(intervalMs = SWEEP_INTERVAL_MS) {
      const timer = setInterval(() => void store.sweep(), intervalMs);
      timer.unref();
      return () => clearInterval(timer);
    },
  };
  return store;
}

/** A hora da mensagem no aplicativo (a leva compara essa hora, não a de chegada ao processo). */
function sentAt(message: CanonicalMessage): number {
  const at = Date.parse(message.timestamp);
  return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
}
