// npm run whatsapp:grupos -- [listar | autorizar <grupo> --consentimento "<texto>" [--conversa "<nome>"] [--dono <provider:conta>] | revogar <grupo>]
// Lista, autoriza e revoga a captura de grupos (feature 004, interfaces/cli-whatsapp-grupos.md). Lê e grava só
// no banco: a lista de grupos vem do processo `npm run dev:whatsapp`, sem segunda conexão com o WhatsApp (D-07).
import { parseArgs } from "node:util";
import { createPgIdentityRepository, createResolveUserByChannelAccount } from "../modules/identity/index.js";
import {
  createCaptureAdmin,
  createPgCaptureRepository,
  createPgGroupDirectory,
  createPgImportSourceRepository,
  type AuthorizeCaptureResult,
  type CaptureStatus,
  type GroupListing,
} from "../modules/sources/index.js";
import { createPool, type Pool } from "../platform/db/index.js";
import { DomainError } from "../shared/index.js";

export class UsageError extends Error {}

const USAGE = [
  "uso:",
  "  npm run whatsapp:grupos                      lista os grupos do número de captura",
  '  npm run whatsapp:grupos -- autorizar <grupo> --consentimento "<texto>" [--conversa "<nome>"] [--dono <provider:conta>]',
  "  npm run whatsapp:grupos -- revogar <grupo>",
  "<grupo> é o número da listagem ou o id do grupo.",
].join("\n");

export type GroupsCommand =
  | { readonly action: "listar" }
  | {
      readonly action: "autorizar";
      readonly group: string;
      readonly consent: string;
      readonly conversation?: string;
      readonly owner: { readonly provider: string; readonly accountId: string };
    }
  | { readonly action: "revogar"; readonly group: string };

function ownerOf(dono: string): { provider: string; accountId: string } {
  const [provider, ...rest] = dono.split(":");
  if (!provider || rest.length === 0) throw new UsageError("--dono deve ter o formato provider:conta, ex.: fake:fake-operator.");
  return { provider, accountId: rest.join(":") };
}

function requireGroup(group: string | undefined): string {
  if (!group?.trim()) throw new UsageError(USAGE);
  return group.trim();
}

export function parseGroupsArgs(argv: readonly string[]): GroupsCommand {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      consentimento: { type: "string" },
      conversa: { type: "string" },
      dono: { type: "string", default: "fake:fake-operator" },
    },
  });
  const [action = "listar", group] = positionals;
  if (action === "listar") return { action };
  if (action === "revogar") return { action, group: requireGroup(group) };
  if (action !== "autorizar") throw new UsageError(USAGE);
  return {
    action,
    group: requireGroup(group),
    consent: values.consentimento ?? "",
    ...(values.conversa !== undefined ? { conversation: values.conversa } : {}),
    owner: ownerOf(values.dono),
  };
}

export type GroupsResult =
  | { readonly action: "listar"; readonly listing: GroupListing }
  | { readonly action: "autorizar"; readonly result: AuthorizeCaptureResult }
  | { readonly action: "revogar"; readonly subject: string };

export async function runGroups(command: GroupsCommand, pool: Pool): Promise<GroupsResult> {
  const admin = createCaptureAdmin({
    directory: createPgGroupDirectory(pool),
    captures: createPgCaptureRepository(pool),
    sources: createPgImportSourceRepository(pool),
  });
  if (command.action === "listar") return { action: "listar", listing: await admin.list() };
  if (command.action === "revogar") return { action: "revogar", subject: (await admin.revoke(command.group)).subject };
  const owner = await createResolveUserByChannelAccount(createPgIdentityRepository(pool))(command.owner.provider, command.owner.accountId);
  if (!owner) throw new UsageError(`Dono não encontrado: ${command.owner.provider}:${command.owner.accountId}.`);
  const result = await admin.authorize({
    owner,
    group: command.group,
    consent: command.consent,
    ...(command.conversation !== undefined ? { conversation: command.conversation } : {}),
  });
  return { action: "autorizar", result };
}

const TIME_ZONE = "America/Sao_Paulo";
const dateTime = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const shortDateTime = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmt = (formatter: Intl.DateTimeFormat, date: Date) => formatter.format(date).replace(",", "");

function statusText(status: CaptureStatus, leftAt: Date | null): string {
  if (leftAt) return "o número saiu do grupo";
  if (status.kind === "authorized") return `autorizado (fonte "${status.sourceTitle}", desde ${fmt(shortDateTime, status.since)})`;
  if (status.kind === "revoked") return `revogado em ${fmt(shortDateTime, status.at)}`;
  return "não autorizado";
}

/** Sem pessoas, números nem declarações de consentimento: só o nome do grupo, que o operador precisa reconhecer. */
export function formatListing(listing: GroupListing): string {
  if (listing.groups.length === 0 || !listing.updatedAt) {
    return "Nenhum grupo conhecido. Ligue a captura e rode `npm run dev:whatsapp` para atualizar a lista.";
  }
  const width = Math.max(...listing.groups.map((g) => g.subject.length));
  const lines = listing.groups.map(
    (g) => `  ${String(g.position).padStart(2)}. ${g.subject.padEnd(width)}   ${String(g.participants).padStart(3)} participantes   ${statusText(g.status, g.leftAt)}`,
  );
  return [
    `Grupos do número de captura (atualizado em ${fmt(dateTime, listing.updatedAt)}):`,
    ...lines,
    'Para autorizar: npm run whatsapp:grupos -- autorizar <número> --consentimento "<texto>" [--conversa "<nome>"]',
  ].join("\n");
}

export function formatResult(result: GroupsResult): string {
  if (result.action === "listar") return formatListing(result.listing);
  if (result.action === "revogar") {
    return `Captura do grupo "${result.subject}" revogada. As mensagens já guardadas continuam pesquisáveis (exclusão na S5).`;
  }
  const { subject, sourceTitle, linkedToImport } = result.result;
  const source = linkedToImport ? `fonte "${sourceTitle}"` : `fonte nova "${sourceTitle}"`;
  return `Grupo "${subject}" autorizado para captura (${source}). Mensagens novas a partir de agora.`;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new UsageError("DATABASE_URL não definido. Rode `npm run setup` para gerar o .env.");
  const command = parseGroupsArgs(process.argv.slice(2));
  const pool = createPool(databaseUrl);
  try {
    process.stdout.write(`${formatResult(await runGroups(command, pool))}\n`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("src/main/whatsapp-groups.ts")) {
  main().catch((error: unknown) => {
    const expected = error instanceof UsageError || error instanceof DomainError;
    console.error(expected ? (error as Error).message : "Falha inesperada no comando de grupos; nada foi alterado.");
    if (!expected) console.error((error as Error).name);
    process.exit(1);
  });
}
