// Lista de gestão e referência a uma conversa (feature 006, D-04, D-15; RN-03).
import { normalizeText } from "./command.js";

/** Estado de cada item da lista, do ponto de vista de quem pergunta. */
export type ItemState = "following" | "stopped" | "not_following" | "imported" | "conversation" | "other_account";

export interface ListItem {
  /** `source:<uuid>` ou `group:<id do grupo>`. */
  readonly ref: string;
  readonly title: string;
  readonly state: ItemState;
}

/** A lista mostrada por último, que dá sentido aos números ("acompanhar 4"). */
export interface ListingSnapshot {
  readonly items: readonly ListItem[];
  readonly at: Date;
}

export const PAGE_SIZE = 30;
export const LISTING_TTL_MS = 30 * 60_000;

const LABELS: Record<ItemState, string> = {
  following: "acompanhando",
  stopped: "parado",
  not_following: "não acompanhado",
  imported: "importada",
  conversation: "conversa",
  other_account: "acompanhado por outra conta",
};

export const stateLabel = (state: ItemState): string => LABELS[state];

export interface ListingPage {
  readonly text: string;
  readonly page: number;
  readonly hasMore: boolean;
}

/** Uma página da lista, numerada pela posição na lista inteira. */
export function listingPage(items: readonly ListItem[], page: number): ListingPage {
  if (items.length === 0) {
    return { text: "Você ainda não tem grupos nem conversas. Importe uma conversa ou adicione o número do agente a um grupo.", page: 1, hasMore: false };
  }
  const start = (page - 1) * PAGE_SIZE;
  const slice = items.slice(start, start + PAGE_SIZE);
  if (slice.length === 0) return { text: "Não há mais itens.", page, hasMore: false };
  const end = start + slice.length;
  const hasMore = end < items.length;
  const lines = slice.map((item, i) => `${start + i + 1}. ${item.title} · ${stateLabel(item.state)}`);
  const header = `Seus grupos e conversas (${start + 1}–${end} de ${items.length}):`;
  return { text: [header, ...lines, ...(hasMore ? ['Mande "mais" para ver o resto.'] : [])].join("\n"), page, hasMore };
}

export type RefResolution =
  | { readonly kind: "found"; readonly item: ListItem }
  | { readonly kind: "ambiguous"; readonly candidates: readonly ListItem[] }
  | { readonly kind: "not_found" }
  | { readonly kind: "stale_number" };

function byNumber(ref: string, items: readonly ListItem[], snapshot: ListingSnapshot | null, now: Date): RefResolution {
  const fresh = snapshot && now.getTime() - snapshot.at.getTime() <= LISTING_TTL_MS;
  const listed = fresh ? snapshot.items[Number(ref) - 1] : undefined;
  if (!listed) return { kind: "stale_number" };
  const current = items.find((i) => i.ref === listed.ref);
  return current ? { kind: "found", item: current } : { kind: "not_found" };
}

function oneOf(candidates: readonly ListItem[]): RefResolution | null {
  if (candidates.length === 1 && candidates[0]) return { kind: "found", item: candidates[0] };
  if (candidates.length > 1) return { kind: "ambiguous", candidates };
  return null;
}

/** Número da lista vigente (até 30 min), nome exato ou trecho que identifica uma única conversa. */
export function resolveRef(ref: string, items: readonly ListItem[], snapshot: ListingSnapshot | null, now: Date): RefResolution {
  const value = normalizeText(ref);
  if (/^\d{1,4}$/.test(value)) return byNumber(value, items, snapshot, now);
  if (value === "") return { kind: "not_found" };
  const exact = oneOf(items.filter((i) => normalizeText(i.title) === value));
  if (exact) return exact;
  return oneOf(items.filter((i) => normalizeText(i.title).includes(value))) ?? { kind: "not_found" };
}

/** Resposta para nome que serve a mais de uma conversa; os números valem como uma lista nova. */
export function ambiguityText(candidates: readonly ListItem[]): string {
  const options = candidates.map((c, i) => `${i + 1}. ${c.title}`).join(" · ");
  return `Encontrei mais de uma: ${options}. Repita com o número ou o nome completo.`;
}
