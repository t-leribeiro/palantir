// Resposta de "mostra a N" (feature 008, D-06, D-11, interfaces/comando-mostrar.md §3 a §5): a mensagem citada
// inteira, a conversa em volta e, para áudio, a transcrição com o trecho citado marcado e o arquivo em seguida.
// Determinística, como o compositor da S0 (ADR-0007), e neutra: sem formatação de canal (ADR-0004).
import type { AgentReply, Citation, ReplyMedia } from "../../../contracts/channel/knowledge-channel.js";
import type { CitedMessage, ContextMessage, SourceAudio } from "../../retrieval/index.js";
import { formatClock } from "../../../shared/index.js";
import { info } from "./management-replies.js";

/** Transcrição acima disso vira uma janela em volta do trecho citado (D-06). */
export const MAX_TRANSCRIPT_CHARS = 6_000;
/** Texto da mensagem acima disso é cortado: o `AgentReply.text` tem até 20.000 caracteres. */
const MAX_MESSAGE_CHARS = 12_000;
const SNIPPET_CHARS = 280;
/** Limite de áudio do WhatsApp (D-10). */
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
const MARK = "» ";
const ELLIPSIS = "(…)";
const TIME_ZONE = "America/Sao_Paulo";

const DATE = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const DAY = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" });
const TIME = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });

/** A citação pedida, como foi guardada: o número e, para áudio, a faixa do trecho. */
export interface ShownCitation {
  readonly index: number;
  readonly audioStartS?: number;
  readonly audioEndS?: number;
}

export interface FoundContext {
  readonly message: CitedMessage;
  readonly before: readonly ContextMessage[];
  readonly after: readonly ContextMessage[];
}

export const noRecentReply = (): AgentReply =>
  info('Não tenho citações recentes para mostrar. Faça a pergunta de novo e depois mande "mostra a" com o número da citação.');
export const outOfRangeReply = (count: number): AgentReply =>
  info(
    count === 1
      ? 'A última resposta tem só 1 citação. Mande "mostra a 1".'
      : `A última resposta tem só ${count} citações. Mande "mostra a 1" até "mostra a ${count}".`,
  );
export const deletedReply = (): AgentReply => info("Essa conversa foi apagada, então não consigo mostrar a mensagem.");
export const notFoundReply = (): AgentReply => info("Não encontrei mais essa mensagem.");

const snippet = (text: string, max = SNIPPET_CHARS) => (text.length > max ? `${text.slice(0, max)}…` : text);

function header(index: number, m: CitedMessage): string {
  const duration = m.audio?.durationSeconds;
  const audio = m.kind === "audio" && duration !== null && duration !== undefined ? `, áudio de ${formatClock(duration)}` : "";
  return `[${index}] ${m.author} em ${m.sourceTitle}, ${DATE.format(m.sentAt)} às ${TIME.format(m.sentAt)}${audio}:`;
}

/** Hora da vizinha; com a data quando ela é de outro dia que a citada. */
function when(sentAt: Date, citedAt: Date): string {
  const time = TIME.format(sentAt);
  return DAY.format(sentAt) === DAY.format(citedAt) ? time : `${DAY.format(sentAt)} ${time}`;
}

function neighborText(n: Pick<ContextMessage, "kind" | "text" | "durationSeconds">): string {
  if (n.kind !== "audio") return snippet(n.text);
  const tag = n.durationSeconds === undefined ? "[áudio]" : `[áudio de ${formatClock(n.durationSeconds)}]`;
  return n.text === "" ? tag : `${tag} ${snippet(n.text)}`;
}

function conversation(found: FoundContext): string[] {
  const { message, before, after } = found;
  if (before.length === 0 && after.length === 0) return [];
  const line = (n: ContextMessage) => `${when(n.sentAt, message.sentAt)} ${n.author}: ${neighborText(n)}`;
  const duration = message.audio?.durationSeconds;
  const cited = { kind: message.kind, text: message.text || transcriptText(message.audio), ...(duration === null || duration === undefined ? {} : { durationSeconds: duration }) };
  const citedLine = `${MARK}${TIME.format(message.sentAt)} ${message.author}: ${neighborText(cited)}`;
  return ["", "Conversa em volta:", ...before.map(line), citedLine, ...after.map(line)];
}

const transcriptText = (audio: SourceAudio | undefined) => (audio?.segments ?? []).map((s) => s.text).join(" ");

const overlaps = (s: { start: number; end: number }, c: ShownCitation) =>
  c.audioStartS !== undefined && c.audioEndS !== undefined && s.start < c.audioEndS && s.end > c.audioStartS;

/** Janela de linhas em volta das marcadas, até o limite de caracteres, com "(…)" onde cortou. */
function window(lines: readonly string[], marked: readonly boolean[]): string[] {
  const size = (from: number, to: number) => lines.slice(from, to + 1).join("\n").length;
  if (size(0, lines.length - 1) <= MAX_TRANSCRIPT_CHARS) return [...lines];
  let from = Math.max(0, marked.indexOf(true));
  let to = from;
  for (let grew = true; grew; ) {
    grew = false;
    if (to + 1 < lines.length && size(from, to + 1) <= MAX_TRANSCRIPT_CHARS) [to, grew] = [to + 1, true];
    if (from > 0 && size(from - 1, to) <= MAX_TRANSCRIPT_CHARS) [from, grew] = [from - 1, true];
  }
  return [...(from > 0 ? [ELLIPSIS] : []), ...lines.slice(from, to + 1), ...(to < lines.length - 1 ? [ELLIPSIS] : [])];
}

const PROCESSING_TEXT: Readonly<Record<string, string>> = {
  pending: "A transcrição deste áudio ainda não está pronta.",
  failed: "Não consegui transcrever este áudio.",
  too_long: "Este áudio é longo demais para transcrever.",
  empty: "Não encontrei fala neste áudio.",
};

function transcript(audio: SourceAudio, cited: ShownCitation): string[] {
  if (audio.segments.length === 0) return [PROCESSING_TEXT[audio.processing] ?? PROCESSING_TEXT.pending ?? ""];
  const marked = audio.segments.map((s) => overlaps(s, cited));
  const lines = audio.segments.map((s, i) => `${marked[i] ? MARK : ""}${formatClock(s.start)} ${s.text}`);
  return window(lines, marked);
}

const sendable = (audio: SourceAudio) => audio.stored && audio.sizeBytes !== null && audio.sizeBytes > 0;

function mediaOf(audio: SourceAudio, index: number): ReplyMedia[] {
  if (!sendable(audio) || (audio.sizeBytes ?? 0) > MAX_MEDIA_BYTES) return [];
  const duration = audio.durationSeconds === null ? {} : { durationSeconds: audio.durationSeconds };
  return [
    {
      kind: "audio",
      ref: audio.attachmentId,
      mimeType: audio.mimeType,
      ...duration,
      sizeBytes: audio.sizeBytes ?? 0,
      failureText: `Não consegui mandar o arquivo do áudio agora. Tente "mostra a ${index}" de novo daqui a pouco.`,
    },
  ];
}

function audioFooter(audio: SourceAudio): string {
  if (!sendable(audio)) return "O arquivo deste áudio não está guardado, então mando só a transcrição.";
  return (audio.sizeBytes ?? 0) > MAX_MEDIA_BYTES ? "O arquivo deste áudio é grande demais para mandar por aqui." : "Mando o áudio em seguida.";
}

function body(m: CitedMessage, cited: ShownCitation): string[] {
  const text = m.text === "" ? [] : [snippet(m.text, MAX_MESSAGE_CHARS)];
  if (!m.audio) return text;
  return [...text, ...(text.length > 0 ? [""] : []), ...transcript(m.audio, cited)];
}

function citationOf(cited: ShownCitation, m: CitedMessage): Citation {
  const range = cited.audioStartS !== undefined && cited.audioEndS !== undefined ? { audioStartS: cited.audioStartS, audioEndS: cited.audioEndS } : {};
  const kind = (["text", "audio", "image", "document", "link"] as const).find((k) => k === m.kind) ?? "text";
  return { index: cited.index, messageId: m.messageId, author: m.author, sourceTitle: m.sourceTitle, sentAt: m.sentAt.toISOString(), kind, ...range };
}

/** A resposta de "mostra a N" para uma mensagem encontrada. */
export function composeOriginal(cited: ShownCitation, found: FoundContext): AgentReply {
  const { message } = found;
  const footer = message.audio ? ["", audioFooter(message.audio)] : [];
  const media = message.audio ? mediaOf(message.audio, cited.index) : [];
  const text = [header(cited.index, message), "", ...body(message, cited), ...conversation(found), ...footer].join("\n");
  return { text, outcome: "answered", citations: [citationOf(cited, message)], ...(media.length > 0 ? { media } : {}) };
}
