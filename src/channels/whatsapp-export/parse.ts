// Leitura das linhas do .txt exportado pelo WhatsApp (D-03, D-04, D-05). Funções puras: o formato do
// WhatsApp fica só neste adaptador (ADR-0004).

export type DateOrder = "dmy" | "mdy";

export interface LocalDateTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

export interface ParsedMessage {
  readonly local: LocalDateTime;
  readonly author: string;
  readonly text: string;
}

export interface ParseResult {
  readonly messages: readonly ParsedMessage[];
  readonly systemCount: number;
  readonly mediaCount: number;
  readonly unrecognizedLines: number;
  readonly dateOrder: DateOrder;
}

export type ImportFormatErrorCode = "ambiguous_date" | "unrecognized_format";

export class ImportFormatError extends Error {
  constructor(
    readonly code: ImportFormatErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImportFormatError";
  }
}

/** Fração máxima de linhas não reconhecidas antes de recusar o arquivo inteiro (RF-12). */
export const MAX_UNRECOGNIZED_RATIO = 0.05;

const TIME = String.raw`(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[\s\u202f]?([AaPp])\.?\s?[Mm]\.?)?`;
const DATE = String.raw`(\d{1,2})/(\d{1,2})/(\d{2,4}),?\s`;
const ANDROID = new RegExp(String.raw`^${DATE}${TIME}\s-\s(.*)$`);
const IOS = new RegExp(String.raw`^\[${DATE}${TIME}\]\s(.*)$`);
const MARKS = /[\u200e\u200f\ufeff]/g;
const MEDIA = /^<(m[íi]dia oculta|media omitted|anexado:|attached:)|\((arquivo anexado|file attached)\)$/i;
const DELETED = /^(esta mensagem foi apagada|mensagem apagada|voc[êe] apagou esta mensagem|this message was deleted|you deleted this message)$/i;
/** Marcador que o próprio app acrescenta ao fim de mensagens editadas: não é texto do autor. */
const EDITED = /\s*<(mensagem editada|this message was edited)>$/i;
/** Prefixo que o app põe no nome de quem não está na agenda. */
const NOT_IN_CONTACTS = /^~\s*/;

type Kind = "text" | "media" | "system";
type Format = "android" | "ios";

interface RawEntry {
  readonly format: Format;
  readonly a: number;
  readonly b: number;
  readonly year: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly twelveHour: boolean;
  readonly kind: Kind;
  readonly author: string;
  text: string;
}

export function parseExport(lines: Iterable<string>, options: { dateOrder?: DateOrder } = {}): ParseResult {
  const entries: RawEntry[] = [];
  let unrecognized = 0;
  let nonEmpty = 0;
  let firstUnrecognized: string | undefined;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (line.trim() !== "") nonEmpty += 1;
    // O formato fica travado pelo primeiro cabeçalho: linha no outro formato é trecho colado, não mensagem.
    const entry = parseHeader(line, entries[0]?.format);
    if (entry) entries.push(entry);
    else if (entries.length > 0) appendContinuation(entries, line);
    else if (line.trim() !== "") {
      unrecognized += 1;
      firstUnrecognized ??= line;
    }
  }
  assertRecognized(entries.length, unrecognized, nonEmpty, firstUnrecognized);
  const dateOrder = options.dateOrder ?? detectDateOrder(entries);
  // Anexo com legenda também é texto do autor (BUG-20261123-S57G): a legenda vira mensagem; o anexo segue contado.
  const texts = entries.filter((e) => e.kind === "text" || (e.kind === "media" && e.text.trim() !== "")).map((e) => toMessage(e, dateOrder));
  const messages = texts.filter((m) => m.text !== "");
  return {
    messages,
    // Mensagem sem texto (ex.: `Autor: ` vazio) não é conhecimento: conta como ignorada, junto das de sistema.
    systemCount: entries.filter((e) => e.kind === "system").length + texts.length - messages.length,
    mediaCount: entries.filter((e) => e.kind === "media").length,
    unrecognizedLines: unrecognized,
    dateOrder,
  };
}

function parseHeader(line: string, format: Format | undefined): RawEntry | null {
  const clean = line.replace(/^[\u200e\u200f\ufeff]+/, "");
  const header = matchHeader(clean, format);
  if (!header) return null;
  const [, a, b, year, hour, minute, second, ampm, rest = ""] = header.match;
  const { kind, author, text } = classify(rest, header.format === "ios");
  return {
    format: header.format,
    a: Number(a),
    b: Number(b),
    year: normalizeYear(Number(year)),
    hour: to24h(Number(hour), ampm),
    minute: Number(minute),
    second: Number(second ?? 0),
    twelveHour: ampm !== undefined,
    kind,
    author,
    text,
  };
}

/** Casa o cabeçalho no formato já travado do arquivo; sem formato ainda, aceita os dois. */
function matchHeader(clean: string, format: Format | undefined): { format: Format; match: RegExpExecArray } | null {
  const ios = format === "android" ? null : IOS.exec(clean);
  if (ios) return { format: "ios", match: ios };
  const android = format === "ios" ? null : ANDROID.exec(clean);
  return android ? { format: "android", match: android } : null;
}

function classify(rest: string, ios: boolean): { kind: Kind; author: string; text: string } {
  const separator = rest.indexOf(": ");
  if (separator < 0) return { kind: "system", author: "", text: "" };
  const author = rest.slice(0, separator).replace(MARKS, "").trim().replace(NOT_IN_CONTACTS, "");
  const rawText = rest.slice(separator + 2);
  const text = rawText.replace(MARKS, "").trim();
  if (MEDIA.test(text)) return { kind: "media", author, text: "" };
  if (DELETED.test(text) || (ios && rawText.startsWith("\u200e"))) return { kind: "system", author, text: "" };
  return { kind: "text", author, text };
}

/** Linha sem cabeçalho continua a mensagem anterior: texto em várias linhas ou legenda de um anexo. */
function appendContinuation(entries: RawEntry[], line: string): void {
  const last = entries[entries.length - 1];
  const clean = line.replace(MARKS, "");
  if (last?.kind === "text") last.text = `${last.text}\n${clean}`;
  else if (last?.kind === "media") last.text = last.text.trim() === "" ? clean.trim() : `${last.text}\n${clean}`;
}

function assertRecognized(entries: number, unrecognized: number, nonEmpty: number, sample: string | undefined): void {
  if (entries > 0 && unrecognized / Math.max(nonEmpty, 1) <= MAX_UNRECOGNIZED_RATIO) return;
  throw new ImportFormatError(
    "unrecognized_format",
    `Formato não reconhecido (padrão encontrado: ${mask(sample ?? "")}). Nada foi importado.`,
  );
}

/** Mostra só a forma da linha, sem o conteúdo (privacidade): letras viram a/A e dígitos N. */
function mask(line: string): string {
  return line.slice(0, 32).replace(/\p{Lu}/gu, "A").replace(/\p{Ll}/gu, "a").replace(/\d/g, "N");
}

function detectDateOrder(entries: readonly RawEntry[]): DateOrder {
  if (entries.some((e) => e.a > 12)) return "dmy";
  if (entries.some((e) => e.b > 12)) return "mdy";
  if (!entries.some((e) => e.twelveHour)) return "dmy";
  throw new ImportFormatError("ambiguous_date", "Datas ambíguas (dia e mês ≤ 12). Informe --formato-data dmy ou mdy.");
}

function toMessage(e: RawEntry, order: DateOrder): ParsedMessage {
  const [day, month] = order === "dmy" ? [e.a, e.b] : [e.b, e.a];
  return {
    local: { year: e.year, month, day, hour: e.hour, minute: e.minute, second: e.second },
    author: e.author,
    text: e.text.replace(EDITED, "").trim(),
  };
}

function normalizeYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

function to24h(hour: number, ampm: string | undefined): number {
  if (!ampm) return hour;
  const pm = ampm.toLowerCase() === "p";
  if (hour === 12) return pm ? 12 : 0;
  return pm ? hour + 12 : hour;
}
