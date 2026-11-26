// Respostas do guardar, listar e esquecer (feature 009, interfaces/comandos-guardar.md §2 a §6). Determinísticas e
// neutras (ADR-0004): o canal só renderiza. O tema vem do dono e entra no texto da resposta, nunca em log.
import type { AgentReply, Citation } from "../../../contracts/channel/knowledge-channel.js";
import { formatClock } from "../../../shared/index.js";
import { info } from "./management-replies.js";

/** Autor de todo item guardado: o WhatsApp não informa quem escreveu a mensagem encaminhada (D-03). */
export const SAVED_AUTHOR = "Você";
export const savedSourceTitle = (theme: string): string => `Guardados · ${theme}`;
/** Itens por pedido de guardar (RN-01). */
export const MAX_ITEMS_PER_SAVE = 20;

const SNIPPET_CHARS = 280;
const PREVIEW_CHARS = 60;
const TIME_ZONE = "America/Sao_Paulo";
const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "25/11/2026 14:02", no fuso do dono. */
export const formatSavedAt = (date: Date): string => DATE_TIME.format(date).replace(",", "");

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const SAVE_TEXT = {
  received: 'Recebi. Para guardar, mande "guarda em <tema>".',
  askTheme: 'Em qual tema eu guardo? Responda só o nome, por exemplo "arquitetura".',
  themeTooLong: "O tema pode ter até 60 caracteres.",
  nothingToSave: 'Não há nada para guardar. Encaminhe a mensagem e depois mande "guarda em <tema>".',
  quotedNotFound: 'Não achei essa mensagem encaminhada. Encaminhe de novo e mande "guarda em <tema>".',
  untitledNotice: 'Guardei em "sem tema" o que você encaminhou sem dizer o tema.',
  noThemes: 'Você ainda não guardou nada. Encaminhe uma mensagem e mande "guarda em <tema>".',
  notSaved: 'Só dá para esquecer um item guardado. Para tirar uma conversa, use "apagar <nome>".',
  forgetExpired: 'O pedido expirou. Liste o tema de novo e mande "esquece a N".',
  failed: (theme: string) => `Não consegui guardar agora. Tente "guarda em ${theme}" de novo daqui a pouco.`,
  forgetAsk: (preview: string, theme: string) => `Apago "${preview}" de ${theme}? Responda "confirmo".`,
  forgotten: (theme: string) => `Apaguei de ${theme}.`,
  emptyTheme: (theme: string) => `Você ainda não guardou nada sobre ${theme}.`,
} as const;

/** O que aconteceu com cada coisa de um pedido de guardar, só em contagens. */
export interface SaveSummary {
  readonly theme: string;
  readonly saved: number;
  readonly duplicates: number;
  /** Foto, vídeo ou documento sem legenda. */
  readonly noCaption: number;
  /** Figurinha e tipos que não são guardados. */
  readonly unsupported: number;
  /** Áudio sem o armazenamento de mídia ligado. */
  readonly mediaOff: number;
  readonly failed: number;
  /** O que passou do limite de 20 por pedido. */
  readonly overflow: number;
}

function savedSentence(s: SaveSummary): string | null {
  if (s.saved === 0 && s.duplicates === 1) return `Isso já estava guardado em ${s.theme}.`;
  if (s.saved === 0 && s.duplicates > 1) return `Os ${s.duplicates} itens já estavam guardados em ${s.theme}.`;
  if (s.saved === 0) return null;
  const head = s.saved === 1 ? `Guardei em ${s.theme}.` : `Guardei ${s.saved} itens em ${s.theme}.`;
  if (s.duplicates === 0) return head;
  return `${head.slice(0, -1)}; ${s.duplicates} ${plural(s.duplicates, "já estava guardado", "já estavam guardados")}.`;
}

function leftOutSentences(s: SaveSummary, alone: boolean): string[] {
  const out: string[] = [];
  if (s.noCaption > 0) out.push(alone ? "Dessa mensagem eu só guardaria a legenda, e ela não tem." : `${s.noCaption} sem legenda ${plural(s.noCaption, "ficou", "ficaram")} de fora: de foto, vídeo e documento eu só guardo a legenda.`);
  if (s.unsupported > 0) out.push(alone ? "Esse tipo de mensagem eu não guardo." : `${s.unsupported} de um tipo que eu não guardo ${plural(s.unsupported, "ficou", "ficaram")} de fora.`);
  if (s.mediaOff > 0) out.push("Não consigo guardar áudio agora: o armazenamento de mídia não está ligado.");
  if (s.overflow > 0) out.push(`Outros ${s.overflow} passaram do limite de ${MAX_ITEMS_PER_SAVE} por vez.`);
  return out;
}

/** A resposta de um pedido de guardar, juntando o que foi guardado, o que já estava e o que ficou de fora. */
export function composeSaveReply(s: SaveSummary): AgentReply {
  const total = s.saved + s.duplicates + s.noCaption + s.unsupported + s.mediaOff + s.failed;
  if (s.failed > 0 && s.saved === 0) return info(SAVE_TEXT.failed(s.theme));
  const lines = [savedSentence(s), ...leftOutSentences(s, total === 1)].filter((line): line is string => line !== null);
  if (s.failed > 0) lines.push(`Não consegui guardar ${s.failed} ${plural(s.failed, "item", "itens")} agora; tente de novo daqui a pouco.`);
  return info(lines.length > 0 ? lines.join("\n") : SAVE_TEXT.nothingToSave);
}

/** Um item guardado na listagem (o que o `knowledge` devolve, visto pelo agente). */
export interface SavedEntryView {
  readonly messageId: string;
  readonly kind: string;
  readonly text: string | null;
  readonly savedAt: Date;
  readonly durationSeconds?: number;
}

function snippet(text: string, max = SNIPPET_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/** Primeiros 60 caracteres, para a confirmação do "esquece a N". */
export const forgetPreview = (text: string | null): string => (text?.trim() ? snippet(text, PREVIEW_CHARS) : "o áudio");

function entryLine(entry: SavedEntryView, index: number): string {
  const when = formatSavedAt(entry.savedAt);
  const text = entry.text?.trim() ? entry.text : null;
  if (entry.kind !== "audio") return `${index}. ${when}: “${snippet(text ?? "")}” [${index}]`;
  const audio = entry.durationSeconds === undefined ? "áudio" : `áudio de ${formatClock(entry.durationSeconds)}`;
  return text ? `${index}. ${when}, ${audio}: “${snippet(text)}” [${index}]` : `${index}. ${when}, ${audio} (transcrição pendente) [${index}]`;
}

/** A listagem do tema (D-12): numerada, com uma citação por item, para o "mostra a N" e o "esquece a N". */
export function composeThemeListing(theme: string, total: number, items: readonly SavedEntryView[]): AgentReply {
  const citations: Citation[] = items.map((entry, i) => ({
    index: i + 1,
    messageId: entry.messageId,
    author: SAVED_AUTHOR,
    sourceTitle: savedSourceTitle(theme),
    sentAt: entry.savedAt.toISOString(),
    ...(entry.kind === "audio" ? { kind: "audio" as const } : {}),
  }));
  const lines = items.map((entry, i) => entryLine(entry, i + 1));
  const footer = [total > items.length ? `Mostrando os ${items.length} mais recentes de ${total}.` : null, '"mostra a 2" abre o item inteiro; "esquece a 2" apaga.'];
  const text = [`Guardados em ${theme} (${total}):`, ...lines, "", ...footer.filter((l): l is string => l !== null)].join("\n");
  return { text, outcome: "answered", citations };
}

/** "Seus temas: arquitetura (3), leituras (1)." */
export function composeThemes(themes: readonly { readonly theme: string; readonly count: number }[]): AgentReply {
  if (themes.length === 0) return info(SAVE_TEXT.noThemes);
  return info(`Seus temas: ${themes.map((t) => `${t.theme} (${t.count})`).join(", ")}.`);
}

/** Tema sem itens, com até 5 temas existentes como sugestão. */
export function composeEmptyTheme(theme: string, themes: readonly { readonly theme: string }[]): AgentReply {
  const known = themes.slice(0, 5).map((t) => t.theme);
  return info(known.length === 0 ? SAVE_TEXT.emptyTheme(theme) : `${SAVE_TEXT.emptyTheme(theme)}\nSeus temas: ${known.join(", ")}.`);
}
