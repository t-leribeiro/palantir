// Importador (D-12): arquivo exportado → mensagens → mesma ingestão do núcleo → relatório (RF-09).
// Tudo que pode recusar o arquivo (segurança, formato, datas) acontece antes da primeira gravação (RN-05).
import type { CanonicalMessage, IngestOutcome, InboundHandler, MediaContent } from "../../contracts/channel/knowledge-channel.js";
import { CONTRACT_VERSION } from "../../contracts/channel/knowledge-channel.js";
import { validateCanonicalMessage } from "../../platform/contracts/validator.js";
import { newId, systemClock, type Clock, type IdGenerator } from "../../shared/index.js";
import { assignImportKeys, localToUtc } from "./keys.js";
import { parseExport, type DateOrder, type ParsedAttachment, type ParsedMessage } from "./parse.js";
import { openExportArchive, type ExportArchive, type ReadOptions } from "./zip.js";

export const EXPORT_ADAPTER = "whatsapp-export";
const MAX_TEXT = 50_000;

export interface ImportTarget {
  readonly provider: string;
  readonly accountId: string;
  readonly conversationId: string;
  readonly title: string;
}

export interface ImportOptions {
  readonly conversation: string;
  readonly timeZone?: string;
  readonly dateOrder?: DateOrder;
  readonly read?: ReadOptions;
}

/** Preparação dos anexos pelo núcleo (feature 005, D-03): guarda cifrado e marca o anexo. */
export type PrepareMedia = (message: CanonicalMessage, fetch: (fetchRef: string) => Promise<MediaContent>) => Promise<CanonicalMessage>;

export interface ImportDeps {
  /** Cria ou reutiliza a fonte autorizada da conversa no espaço do dono. */
  readonly ensureSource: (title: string) => Promise<ImportTarget>;
  readonly ingest: InboundHandler;
  /** Sem ele (mídia desligada), os áudios continuam só contados, como até a S3. */
  readonly prepare?: PrepareMedia;
  /** Classifica o anexo pelo nome do arquivo: só `audio` vira mensagem nesta fatia. */
  readonly isAudio?: (fileName: string) => boolean;
  /** MIME pelo nome do arquivo. */
  readonly mimeOf?: (fileName: string) => string;
  readonly ids?: IdGenerator;
  readonly clock?: Clock;
}

export interface ImportReport {
  readonly conversation: string;
  readonly period: { readonly from: Date; readonly to: Date } | null;
  readonly imported: number;
  readonly existing: number;
  /** Já capturadas ao vivo: ganharam a proveniência da importação, sem duplicar (feature 004). */
  readonly reconciled: number;
  readonly rejected: number;
  readonly systemIgnored: number;
  readonly mediaFound: number;
  readonly unrecognizedLines: number;
  /** Feature 005 (D-17): áudios que entraram com o arquivo guardado. */
  readonly audiosLinked: number;
  /** Áudios citados no .txt sem o arquivo no export. */
  readonly audiosMissing: number;
  /** Áudios com legenda: a legenda entrou como texto; o arquivo não foi vinculado nesta fatia. */
  readonly audiosCaptioned: number;
  /** Áudios novos que foram para a fila de transcrição. */
  readonly audiosQueued: number;
  /** Mídias que não são áudio (só contadas). */
  readonly otherMedia: number;
}

export async function importWhatsAppExport(file: string, options: ImportOptions, deps: ImportDeps): Promise<ImportReport> {
  const archive = await openExportArchive(file, options.read);
  try {
    return await importArchive(archive, options, deps);
  } finally {
    archive.close();
  }
}

type Counts = Record<IngestOutcome["outcome"], number>;
const zeroCounts = (): Counts => ({ accepted: 0, duplicate: 0, reconciled: 0, rejected: 0 });

async function importArchive(archive: ExportArchive, options: ImportOptions, deps: ImportDeps): Promise<ImportReport> {
  const lines: string[] = [];
  for await (const line of archive.lines()) lines.push(line);
  const parsed = parseExport(lines, options.dateOrder ? { dateOrder: options.dateOrder } : {});
  const timeZone = options.timeZone ?? "America/Sao_Paulo";
  const sentAt = parsed.messages.map((m) => localToUtc(m.local, timeZone));

  const target = await deps.ensureSource(options.conversation);
  const keys = assignImportKeys(parsed.messages.map((m, i) => ({ conversation: target.conversationId, sentAt: at(sentAt, i), author: m.author, text: m.text })));
  const counts = zeroCounts();
  const build = messageBuilder(target, deps.ids ?? newId, deps.clock ?? systemClock);
  for (const [i, message] of parsed.messages.entries()) {
    const outcome = await ingestOne(build(message, at(sentAt, i), keys[i] ?? ""), deps.ingest);
    counts[outcome.outcome] += 1;
  }
  const audio = await importAudios(archive, parsed.attachments, { target, timeZone, deps, counts });
  return {
    conversation: target.title,
    period: sentAt.length > 0 ? { from: new Date(Math.min(...sentAt.map(Number))), to: new Date(Math.max(...sentAt.map(Number))) } : null,
    imported: counts.accepted,
    existing: counts.duplicate,
    reconciled: counts.reconciled,
    rejected: counts.rejected,
    systemIgnored: parsed.systemCount,
    mediaFound: parsed.mediaCount,
    unrecognizedLines: parsed.unrecognizedLines,
    ...audio,
    otherMedia: parsed.mediaCount - audio.audiosLinked - audio.audiosMissing - audio.audiosCaptioned,
  };
}

interface AudioContext {
  readonly target: ImportTarget;
  readonly timeZone: string;
  readonly deps: ImportDeps;
  readonly counts: Counts;
}

/** Áudio sem legenda vira mensagem `audio` com o arquivo do ZIP, ou indisponível se faltar (RF-01, RF-02, D-17). */
async function importAudios(archive: ExportArchive, attachments: readonly ParsedAttachment[], ctx: AudioContext) {
  const { deps, target } = ctx;
  const isAudio = deps.isAudio ?? (() => false);
  const audios = attachments.filter((a) => a.fileName !== undefined && isAudio(a.fileName));
  const captioned = audios.filter((a) => a.captioned).length;
  const result = { audiosLinked: 0, audiosMissing: 0, audiosCaptioned: captioned, audiosQueued: 0 };
  const prepare = deps.prepare;
  // Sem preparação (mídia desligada), os áudios continuam só contados, como "outras mídias".
  if (!prepare) return { ...result, audiosCaptioned: 0 };
  const uncaptioned = audios.filter((a) => !a.captioned);
  const sentAt = uncaptioned.map((a) => localToUtc(a.local, ctx.timeZone));
  const keys = assignImportKeys(uncaptioned.map((a, i) => ({ conversation: target.conversationId, sentAt: at(sentAt, i), author: a.author, text: `[áudio] ${a.fileName ?? ""}` })));
  const build = audioBuilder(target, deps, archive);
  for (const [i, audio] of uncaptioned.entries()) {
    const message = await prepare(build(audio, at(sentAt, i), keys[i] ?? ""), (name) => readMedia(archive, name, deps));
    const stored = message.attachments[0]?.status === "stored";
    const outcome = await ingestOne(message, deps.ingest);
    ctx.counts[outcome.outcome] += 1;
    if (stored) result.audiosLinked += 1;
    else result.audiosMissing += 1;
    if (stored && outcome.outcome === "accepted") result.audiosQueued += 1;
  }
  return result;
}

async function readMedia(archive: ExportArchive, name: string, deps: ImportDeps): Promise<MediaContent> {
  return { bytes: await archive.read(name), mimeType: (deps.mimeOf ?? (() => "application/octet-stream"))(name) };
}

function audioBuilder(target: ImportTarget, deps: ImportDeps, archive: ExportArchive) {
  const ids = deps.ids ?? newId;
  const clock = deps.clock ?? systemClock;
  const mimeOf = deps.mimeOf ?? (() => "application/octet-stream");
  return (a: ParsedAttachment, sentAt: Date, importKey: string): CanonicalMessage => {
    const name = a.fileName ?? "";
    const attachment = archive.has(name)
      ? { id: name, mimeType: mimeOf(name), fetchRef: name }
      : { id: name, mimeType: mimeOf(name), status: "unavailable" as const, unavailableReason: "missing_in_export" as const };
    return {
      contractVersion: CONTRACT_VERSION,
      id: ids(),
      source: { provider: target.provider, accountId: target.accountId, conversationId: target.conversationId, importKey },
      sender: { externalId: normalizeAuthor(a.author), displayName: a.author },
      timestamp: sentAt.toISOString(),
      kind: "audio",
      isForwarded: false,
      attachments: [attachment],
      provenance: { captureMethod: "export_import", capturedAt: clock.now().toISOString(), adapter: EXPORT_ADAPTER },
    };
  };
}

function at(dates: readonly Date[], i: number): Date {
  const date = dates[i];
  if (!date) throw new Error(`Data ausente para a mensagem ${i}.`);
  return date;
}

function messageBuilder(target: ImportTarget, ids: IdGenerator, clock: Clock) {
  return (m: ParsedMessage, sentAt: Date, importKey: string): unknown => ({
    contractVersion: CONTRACT_VERSION,
    id: ids(),
    source: { provider: target.provider, accountId: target.accountId, conversationId: target.conversationId, importKey },
    sender: { externalId: normalizeAuthor(m.author), displayName: m.author },
    timestamp: sentAt.toISOString(),
    kind: "text",
    text: m.text.slice(0, MAX_TEXT),
    isForwarded: false,
    attachments: [],
    provenance: { captureMethod: "export_import", capturedAt: clock.now().toISOString(), adapter: EXPORT_ADAPTER },
  });
}

async function ingestOne(message: unknown, ingest: InboundHandler): Promise<{ outcome: IngestOutcome["outcome"] }> {
  const valid = validateCanonicalMessage(message);
  if (!valid.ok) return { outcome: "rejected" };
  const outcome: IngestOutcome = await ingest(valid.value as CanonicalMessage);
  return { outcome: outcome.outcome };
}

function normalizeAuthor(author: string): string {
  return author.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 200) || "desconhecido";
}
