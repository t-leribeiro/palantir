// npm run auditoria -- [--desde AAAA-MM-DD] [--limite N] (feature 006, RF-09, D-13;
// interfaces/cli-vinculo-grupos-auditoria.md §3). Lê só o banco; nunca mostra texto de mensagem.
import { parseArgs } from "node:util";
import { createPgAuditLog, type AuditEntry } from "../modules/sources/index.js";
import { createPool, type Pool } from "../platform/db/index.js";
import { DomainError, maskPhone } from "../shared/index.js";

export class UsageError extends Error {}

export interface AuditCommand {
  readonly since?: Date;
  readonly limit: number;
}

const USAGE = "uso: npm run auditoria -- [--desde AAAA-MM-DD] [--limite N]   (padrão: os 50 eventos mais recentes)";

export function parseAuditArgs(argv: readonly string[]): AuditCommand {
  const { values } = parseArgs({ args: [...argv], options: { desde: { type: "string" }, limite: { type: "string", default: "50" } } });
  const limit = Number(values.limite);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new UsageError(USAGE);
  if (values.desde === undefined) return { limit };
  const since = new Date(`${values.desde}T00:00:00-03:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.desde) || Number.isNaN(since.getTime())) throw new UsageError(USAGE);
  return { since, limit };
}

export function runAudit(command: AuditCommand, pool: Pool): Promise<readonly AuditEntry[]> {
  return createPgAuditLog(pool).list({ limit: command.limit, ...(command.since ? { since: command.since } : {}) });
}

const when = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Alvo legível: nome da fonte enquanto existir, número sempre mascarado, "(apagada)" depois da exclusão. */
function target(entry: AuditEntry): string {
  if (entry.targetKind === "source") return entry.targetLabel ? `fonte ${entry.targetLabel}` : "fonte (apagada)";
  if (!entry.targetLabel) return "conta (removida)";
  return `conta ${entry.targetLabel.startsWith("+") ? maskPhone(entry.targetLabel) : entry.targetLabel}`;
}

const DETAIL_NAMES: Record<string, [string, string]> = { messages: ["mensagem", "mensagens"], audios: ["áudio", "áudios"], objects: ["objeto", "objetos"] };

function details(entry: AuditEntry): string {
  return Object.entries(entry.details)
    .map(([key, n]) => {
      const [one, many] = DETAIL_NAMES[key] ?? [key, key];
      return `${n} ${n === 1 ? one : many}`;
    })
    .join(", ");
}

export function formatAudit(entries: readonly AuditEntry[]): string {
  if (entries.length === 0) return "Nenhum evento de auditoria no período.";
  const rows = entries.map((e) => [when.format(e.at).replace(",", ""), e.action, target(e), e.actorUserId ? (e.channel ?? "-") : "sistema", details(e)]);
  const header = ["Quando", "Ação", "Alvo", "Por", "Detalhes"];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: readonly string[]) => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ").trimEnd();
  return [line(header), ...rows.map(line)].join("\n");
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new UsageError("DATABASE_URL não definido. Rode `npm run setup` para gerar o .env.");
  const command = parseAuditArgs(process.argv.slice(2));
  const pool = createPool(databaseUrl);
  try {
    process.stdout.write(`${formatAudit(await runAudit(command, pool))}\n`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("src/main/audit.ts")) {
  main().catch((error: unknown) => {
    const expected = error instanceof UsageError || error instanceof DomainError;
    console.error(expected ? (error as Error).message : "Falha inesperada ao ler a auditoria.");
    if (!expected) console.error((error as Error).name);
    process.exit(1);
  });
}
