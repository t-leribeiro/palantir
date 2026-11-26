// Espera em memória (feature 009, D-05, D-14). Varredura a cada 30 s: o que venceu sem pedido é descartado (só a
// contagem fica); o que aguardava tema há 10 min vai para "sem tema" pelo `onUntitled`. Reiniciar o processo perde
// tudo o que esperava, de propósito: nada do que o dono não pediu toca o disco (ADR-0014).
import type { CanonicalMessage } from "../../../contracts/channel/knowledge-channel.js";
import { PENDING_HARD_LIMIT, PENDING_TTL_MS, type AddResult, type PendingForwards } from "../application/pending-forwards.js";

export const SWEEP_INTERVAL_MS = 30_000;

interface Entry {
  readonly message: CanonicalMessage;
  readonly at: number;
}

interface Bucket<C> {
  context: C;
  entries: Entry[];
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
    if (bucket.entries.length === 0 && bucket.untitled === 0) buckets.delete(key);
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
    if (gone > 0) options.observer?.discarded(gone);
    dropIfEmpty(key, bucket);
  }

  const store: MemoryPendingForwards<C> = {
    add(key, context, message): AddResult {
      const bucket = bucketOf(key) ?? { context, entries: [], awaitingSince: undefined, untitled: 0 };
      bucket.context = context;
      buckets.set(key, bucket);
      const opened = bucket.entries.length === 0;
      if (bucket.entries.length >= PENDING_HARD_LIMIT) {
        options.observer?.discarded(1);
        return { opened: false, accepted: false };
      }
      bucket.entries.push({ message, at: now() });
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
