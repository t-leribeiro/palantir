// Reconciliação ao vivo × importada (feature 004, RN-04, D-09 e D-10). A importação só conhece o nome do
// autor no celular de quem exportou e a captura conhece o número: o autor não entra no critério, só desempata.

/** Janela de horário: o export mostra só hora e minuto (OQ-01 de ingestion, medida na demonstração). */
export const RECONCILE_WINDOW_MS = 60_000;

/** Texto comparável entre export e captura: NFC, minúsculas, espaços colapsados e aparados. */
export function normalizeForMatch(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Nome comparável para o desempate: sem acentos, minúsculas, espaços colapsados. */
export function normalizeName(name: string): string {
  return normalizeForMatch(name.normalize("NFD").replace(/[̀-ͯ]/g, ""));
}

/** Qual chave falta: a importada procura uma ao vivo ainda sem chave de importação, e vice-versa. */
export type ReconcileDirection = "import_to_live" | "live_to_import";

export function reconcileDirection(message: {
  readonly externalMessageId: string | undefined;
  readonly importKey: string | undefined;
  readonly text: string | undefined;
}): ReconcileDirection | undefined {
  if (!message.text || normalizeForMatch(message.text) === "") return undefined;
  if (message.importKey && !message.externalMessageId) return "import_to_live";
  if (message.externalMessageId && !message.importKey) return "live_to_import";
  return undefined;
}

export interface ReconcileCandidate {
  readonly id: string;
  readonly sentAt: Date;
  readonly authorName: string | undefined;
}

interface Ranked {
  readonly candidate: ReconcileCandidate;
  readonly distance: number;
  readonly sameAuthor: boolean;
}

/**
 * Escolhe a candidata: dentro da janela, menor diferença de horário; em empate, a do mesmo nome de autor;
 * persistindo, a de menor horário e depois o menor id (determinístico, como o ordinal da chave da S1).
 */
export function pickCandidate(
  target: { readonly sentAt: Date; readonly authorName: string | undefined },
  candidates: readonly ReconcileCandidate[],
): ReconcileCandidate | undefined {
  const author = target.authorName ? normalizeName(target.authorName) : undefined;
  const ranked: Ranked[] = candidates
    .map((candidate) => ({
      candidate,
      distance: Math.abs(candidate.sentAt.getTime() - target.sentAt.getTime()),
      sameAuthor: author !== undefined && candidate.authorName !== undefined && normalizeName(candidate.authorName) === author,
    }))
    .filter((r) => r.distance <= RECONCILE_WINDOW_MS);
  ranked.sort(compareRanked);
  return ranked[0]?.candidate;
}

function compareRanked(a: Ranked, b: Ranked): number {
  if (a.distance !== b.distance) return a.distance - b.distance;
  if (a.sameAuthor !== b.sameAuthor) return a.sameAuthor ? -1 : 1;
  const time = a.candidate.sentAt.getTime() - b.candidate.sentAt.getTime();
  if (time !== 0) return time;
  return a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0;
}
