// Importador (D-12): arquivo exportado → mensagens → mesma ingestão do núcleo → relatório (RF-09).
// Tudo que pode recusar o arquivo (segurança, formato, datas) acontece antes da primeira gravação (RN-05).
import type { CanonicalMessage, IngestOutcome, InboundHandler } from "../../contracts/channel/knowledge-channel.js";
import { CONTRACT_VERSION } from "../../contracts/channel/knowledge-channel.js";
import { validateCanonicalMessage } from "../../platform/contracts/validator.js";
import { newId, systemClock, type Clock, type IdGenerator } from "../../shared/index.js";
import { assignImportKeys, localToUtc } from "./keys.js";
import { parseExport, type DateOrder, type ParsedMessage } from "./parse.js";
import { readExportLines, type ReadOptions } from "./zip.js";

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

export interface ImportDeps {
  /** Cria ou reutiliza a fonte autorizada da conversa no espaço do dono. */
  readonly ensureSource: (title: string) => Promise<ImportTarget>;
  readonly ingest: InboundHandler;
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
}

export async function importWhatsAppExport(file: string, options: ImportOptions, deps: ImportDeps): Promise<ImportReport> {
  const lines: string[] = [];
  for await (const line of readExportLines(file, options.read)) lines.push(line);
  const parsed = parseExport(lines, options.dateOrder ? { dateOrder: options.dateOrder } : {});
  const timeZone = options.timeZone ?? "America/Sao_Paulo";
  const sentAt = parsed.messages.map((m) => localToUtc(m.local, timeZone));

  const target = await deps.ensureSource(options.conversation);
  const keys = assignImportKeys(parsed.messages.map((m, i) => ({ conversation: target.conversationId, sentAt: at(sentAt, i), author: m.author, text: m.text })));
  const counts = { accepted: 0, duplicate: 0, reconciled: 0, rejected: 0 };
  const build = messageBuilder(target, deps.ids ?? newId, deps.clock ?? systemClock);
  for (const [i, message] of parsed.messages.entries()) {
    const outcome = await ingestOne(build(message, at(sentAt, i), keys[i] ?? ""), deps.ingest);
    counts[outcome.outcome] += 1;
  }
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
