// Mensagens com mídia guardadas por pouco tempo para o download sob demanda (feature 005, D-18): o núcleo só
// pede o arquivo depois de conferir a autorização. Limitado em quantidade e em tempo; nada vai para o disco.

export interface RecentMedia<T> {
  remember(ref: string, value: T): void;
  /** O valor, se ainda estiver no prazo; `undefined` se expirou ou foi descartado pelo limite. */
  take(ref: string): T | undefined;
  readonly size: number;
}

export const RECENT_MEDIA_LIMIT = 500;
export const RECENT_MEDIA_TTL_MS = 15 * 60 * 1000;

export function createRecentMedia<T>(
  options: { readonly limit?: number; readonly ttlMs?: number; readonly now?: () => number } = {},
): RecentMedia<T> {
  const limit = options.limit ?? RECENT_MEDIA_LIMIT;
  const ttl = options.ttlMs ?? RECENT_MEDIA_TTL_MS;
  const now = options.now ?? Date.now;
  const items = new Map<string, { value: T; at: number }>();
  return {
    remember(ref, value) {
      items.delete(ref);
      items.set(ref, { value, at: now() });
      while (items.size > limit) {
        const oldest = items.keys().next().value;
        if (oldest === undefined) break;
        items.delete(oldest);
      }
    },
    take(ref) {
      const item = items.get(ref);
      if (!item) return undefined;
      if (now() - item.at > ttl) {
        items.delete(ref);
        return undefined;
      }
      return item.value;
    },
    get size() {
      return items.size;
    },
  };
}
