// npm run import -- <arquivo.zip|.txt> --conversa "<nome>" [--fuso <IANA>] [--formato-data dmy|mdy] [--dono <provider:conta>]
// (interfaces/import-cli.md da feature 002)
import { parseArgs } from "node:util";
import { ExportFileError, ImportFormatError, importWhatsAppExport, type DateOrder, type ImportReport } from "../channels/whatsapp-export/index.js";
import { createPgIdentityRepository, createResolveUserByChannelAccount } from "../modules/identity/index.js";
import { createEnsureImportSource, createPgImportSourceRepository } from "../modules/sources/index.js";
import { createPool, type Pool } from "../platform/db/index.js";
import { createJobQueue } from "../platform/queue/index.js";
import { DomainError } from "../shared/index.js";
import { QUEUES, buildIngest } from "./compose.js";

export interface ImportCommand {
  readonly file: string;
  readonly conversation: string;
  readonly timeZone: string;
  readonly dateOrder?: DateOrder;
  readonly owner: { readonly provider: string; readonly accountId: string };
}

export class UsageError extends Error {}

export function parseImportArgs(argv: readonly string[]): ImportCommand {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      conversa: { type: "string" },
      fuso: { type: "string", default: "America/Sao_Paulo" },
      "formato-data": { type: "string" },
      dono: { type: "string", default: "fake:fake-operator" },
    },
  });
  const file = positionals[0];
  if (!file || !values.conversa) throw new UsageError('uso: npm run import -- <arquivo.zip|.txt> --conversa "<nome>" [--fuso <IANA>] [--formato-data dmy|mdy] [--dono <provider:conta>]');
  const order = values["formato-data"];
  if (order !== undefined && order !== "dmy" && order !== "mdy") throw new UsageError("--formato-data deve ser dmy ou mdy.");
  const [provider, ...rest] = values.dono.split(":");
  if (!provider || rest.length === 0) throw new UsageError("--dono deve ter o formato provider:conta, ex.: fake:fake-operator.");
  return {
    file,
    conversation: values.conversa,
    timeZone: values.fuso,
    ...(order ? { dateOrder: order } : {}),
    owner: { provider, accountId: rest.join(":") },
  };
}

export async function runImport(command: ImportCommand, pool: Pool, databaseUrl: string): Promise<ImportReport> {
  const owner = await createResolveUserByChannelAccount(createPgIdentityRepository(pool))(command.owner.provider, command.owner.accountId);
  if (!owner) throw new UsageError(`Conta dona não encontrada: ${command.owner.provider}:${command.owner.accountId}. Rode npm run seed.`);
  const queue = createJobQueue(databaseUrl, QUEUES);
  await queue.start();
  try {
    const ensure = createEnsureImportSource(createPgImportSourceRepository(pool));
    return await importWhatsAppExport(
      command.file,
      { conversation: command.conversation, timeZone: command.timeZone, ...(command.dateOrder ? { dateOrder: command.dateOrder } : {}) },
      { ensureSource: (title) => ensure(owner, title), ingest: buildIngest(pool, queue) },
    );
  } finally {
    await queue.stop();
  }
}

const number = new Intl.NumberFormat("pt-BR");
const day = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

export function formatReport(report: ImportReport): string {
  const period = report.period ? `${day.format(report.period.from)} a ${day.format(report.period.to)}` : "sem mensagens";
  return [
    `Conversa: ${report.conversation} (fonte autorizada)`,
    `Período: ${period}`,
    `Mensagens importadas: ${number.format(report.imported)}`,
    `Já existentes (reimportação): ${number.format(report.existing)}`,
    `Mensagens de sistema ou sem texto ignoradas: ${number.format(report.systemIgnored)}`,
    `Mídias encontradas (tratadas na S4): ${number.format(report.mediaFound)}`,
    `Linhas não reconhecidas: ${number.format(report.unrecognizedLines)}`,
    ...(report.rejected > 0 ? [`Recusadas pelo contrato: ${number.format(report.rejected)}`] : []),
    "A indexação roda no worker: as mensagens ficam pesquisáveis em instantes.",
  ].join("\n");
}

const EXPECTED = [UsageError, ExportFileError, ImportFormatError, DomainError, RangeError];

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new UsageError("DATABASE_URL não definido. Rode `npm run setup` para gerar o .env.");
  const command = parseImportArgs(process.argv.slice(2));
  const pool = createPool(databaseUrl);
  try {
    process.stdout.write(`${formatReport(await runImport(command, pool, databaseUrl))}\n`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("src/main/import.ts")) {
  main().catch((error: unknown) => {
    const expected = EXPECTED.some((type) => error instanceof type);
    console.error(expected ? (error as Error).message : "Falha inesperada na importação; nada além do que o relatório mostrou foi gravado.");
    if (!expected) console.error(error);
    process.exit(1);
  });
}
