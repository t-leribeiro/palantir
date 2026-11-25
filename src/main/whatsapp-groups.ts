// npm run whatsapp:grupos -- [listar | autorizar <grupo> --consentimento "<texto>" [--conversa "<nome>" [--confirmar]] [--dono <provider:conta>] | revogar <grupo>
//                              | apagar <grupo> --nome "<nome do grupo>" [--dono <provider:conta>]]
// Lista, autoriza e revoga a captura de grupos (feature 004, interfaces/cli-whatsapp-grupos.md). Lê e grava só
// no banco: a lista de grupos vem do processo `npm run dev:whatsapp`, sem segunda conexão com o WhatsApp (D-07).
// Desde a feature 006 (RN-09, RF-13): mesmas regras do agente, com auditoria, e `apagar` com o nome do grupo.
import { parseArgs } from "node:util";
import { normalizeText } from "../modules/agent/index.js";
import { createPgIdentityRepository, createResolveUserByChannelAccount, type ResolvedUser } from "../modules/identity/index.js";
import {
  CAPTURE_PROVIDER,
  createCaptureAdmin,
  createPgAuditLog,
  createPgCaptureRepository,
  createPgDeletionStore,
  createPgGroupDirectory,
  createPgImportSourceRepository,
  createPgSpaceSourceRepository,
  createRequestSourceDeletion,
  createSourceManagement,
  resolveGroupRef,
  type AuthorizeCaptureResult,
  type CaptureAdmin,
  type CaptureStatus,
  type GroupListing,
} from "../modules/sources/index.js";
import { createPool, type Pool } from "../platform/db/index.js";
import { createJobQueue } from "../platform/queue/index.js";
import { DomainError } from "../shared/index.js";
import { QUEUES } from "./compose.js";

export class UsageError extends Error {}

const USAGE = [
  "uso:",
  "  npm run whatsapp:grupos                      lista os grupos do número de captura",
  '  npm run whatsapp:grupos -- autorizar <grupo> --consentimento "<texto>" [--conversa "<nome>" [--confirmar]] [--dono <provider:conta>]',
  "  npm run whatsapp:grupos -- revogar <grupo>",
  '  npm run whatsapp:grupos -- apagar <grupo> --nome "<nome do grupo>" [--dono <provider:conta>]',
  "<grupo> é o número da listagem ou o id do grupo.",
].join("\n");

export type GroupsCommand =
  | { readonly action: "listar" }
  | {
      readonly action: "autorizar";
      readonly group: string;
      readonly consent: string;
      readonly conversation?: string;
      readonly confirm: boolean;
      readonly owner: { readonly provider: string; readonly accountId: string };
    }
  | { readonly action: "revogar"; readonly group: string }
  | { readonly action: "apagar"; readonly group: string; readonly name: string; readonly owner: { readonly provider: string; readonly accountId: string } };

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
      confirmar: { type: "boolean", default: false },
      dono: { type: "string", default: "fake:fake-operator" },
      nome: { type: "string" },
    },
  });
  const [action = "listar", group] = positionals;
  if (action === "listar") return { action };
  if (action === "revogar") return { action, group: requireGroup(group) };
  if (action === "apagar") {
    if (!values.nome?.trim()) throw new UsageError('Para apagar, confirme com --nome "<nome do grupo>".');
    return { action, group: requireGroup(group), name: values.nome, owner: ownerOf(values.dono) };
  }
  if (action !== "autorizar") throw new UsageError(USAGE);
  return {
    action,
    group: requireGroup(group),
    consent: values.consentimento ?? "",
    ...(values.conversa !== undefined ? { conversation: values.conversa } : {}),
    confirm: values.confirmar,
    owner: ownerOf(values.dono),
  };
}

export type GroupsResult =
  | { readonly action: "listar"; readonly listing: GroupListing }
  | { readonly action: "autorizar"; readonly result: AuthorizeCaptureResult }
  | { readonly action: "revogar"; readonly subject: string }
  | { readonly action: "apagar"; readonly title: string; readonly outcome: "requested" | "already_deleting" };

async function ownerFor(pool: Pool, owner: { readonly provider: string; readonly accountId: string }): Promise<ResolvedUser> {
  const found = await createResolveUserByChannelAccount(createPgIdentityRepository(pool))(owner.provider, owner.accountId);
  if (!found) throw new UsageError(`Dono não encontrado: ${owner.provider}:${owner.accountId}.`);
  return found;
}

/** Fonte da captura do grupo, para a auditoria (o alvo é a fonte, nunca o nome). */
async function captureSourceOf(pool: Pool, groupId: string): Promise<string | undefined> {
  return (await createPgCaptureRepository(pool).latestByGroup(CAPTURE_PROVIDER)).find((r) => r.groupId === groupId)?.sourceId;
}

async function authorize(pool: Pool, admin: CaptureAdmin, command: Extract<GroupsCommand, { action: "autorizar" }>): Promise<GroupsResult> {
  const owner = await ownerFor(pool, command.owner);
  const groupId = resolveGroupRef((await admin.list()).groups, command.group).groupId;
  const result = await admin.authorize({
    owner,
    group: command.group,
    consent: command.consent,
    ...(command.conversation !== undefined ? { conversation: command.conversation } : {}),
    confirmNameMismatch: command.confirm,
  });
  const sourceId = await captureSourceOf(pool, groupId);
  if (sourceId) await createPgAuditLog(pool).record({ actorUserId: owner.userId, action: "capture.authorized", targetKind: "source", targetId: sourceId, channel: "cli" });
  return { action: "autorizar", result };
}

async function revoke(pool: Pool, admin: CaptureAdmin, group: string): Promise<GroupsResult> {
  const groupId = resolveGroupRef((await admin.list()).groups, group).groupId;
  const { subject } = await admin.revoke(group);
  const sourceId = await captureSourceOf(pool, groupId);
  if (sourceId) await createPgAuditLog(pool).record({ actorUserId: null, action: "capture.revoked", targetKind: "source", targetId: sourceId, channel: "cli" });
  return { action: "revogar", subject };
}

/** Conta verificada do dono no WhatsApp, que recebe o aviso de conclusão; sem ela, não há aviso. */
async function noticeAccount(pool: Pool, userId: string): Promise<{ provider: string; accountId: string } | undefined> {
  const { rows } = await pool.query<{ external_account_id: string }>(
    "SELECT external_account_id FROM channel_accounts WHERE user_id = $1 AND provider = 'whatsapp' AND status = 'active' LIMIT 1",
    [userId],
  );
  const account = rows[0]?.external_account_id;
  return account ? { provider: "whatsapp", accountId: account } : undefined;
}

async function remove(pool: Pool, admin: CaptureAdmin, command: Extract<GroupsCommand, { action: "apagar" }>, databaseUrl: string): Promise<GroupsResult> {
  const owner = await ownerFor(pool, command.owner);
  const group = resolveGroupRef((await admin.list()).groups, command.group);
  if (normalizeText(command.name) !== normalizeText(group.subject)) throw new UsageError(`A confirmação precisa ser o nome exato: "${group.subject}".`);
  const management = createSourceManagement({
    directory: createPgGroupDirectory(pool),
    captures: createPgCaptureRepository(pool),
    admin,
    spaceSources: createPgSpaceSourceRepository(pool),
    audit: createPgAuditLog(pool),
  });
  const target = await management.deletionTarget(owner, `group:${group.groupId}`);
  if (target.kind !== "ok") throw new UsageError(target.kind === "nothing_stored" ? `Não há nada guardado de "${group.subject}".` : "Esse grupo não é deste dono.");
  const queue = createJobQueue(databaseUrl, QUEUES);
  await queue.start();
  try {
    const notify = await noticeAccount(pool, owner.userId);
    const result = await createRequestSourceDeletion(createPgDeletionStore(pool, queue))({
      spaceId: owner.spaceId,
      sourceId: target.sourceId,
      requestedBy: owner.userId,
      channel: "cli",
      title: group.subject,
      ...(notify ? { notify } : {}),
    });
    if (result.outcome === "not_found") throw new UsageError("Fonte não encontrada.");
    return { action: "apagar", title: group.subject, outcome: result.outcome };
  } finally {
    await queue.stop();
  }
}

export async function runGroups(command: GroupsCommand, pool: Pool, databaseUrl = ""): Promise<GroupsResult> {
  const admin = createCaptureAdmin({
    directory: createPgGroupDirectory(pool),
    captures: createPgCaptureRepository(pool),
    sources: createPgImportSourceRepository(pool),
  });
  switch (command.action) {
    case "listar":
      return { action: "listar", listing: await admin.list() };
    case "revogar":
      return revoke(pool, admin, command.group);
    case "apagar":
      return remove(pool, admin, command, databaseUrl);
    case "autorizar":
      return authorize(pool, admin, command);
  }
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
    return `Captura do grupo "${result.subject}" revogada. As mensagens já guardadas continuam pesquisáveis; para apagá-las: npm run whatsapp:grupos -- apagar <grupo> --nome "<nome>".`;
  }
  if (result.action === "apagar") {
    return result.outcome === "requested" ? `Apagando "${result.title}". Acompanhe com: npm run auditoria` : `"${result.title}" já está sendo apagado.`;
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
    process.stdout.write(`${formatResult(await runGroups(command, pool, databaseUrl))}\n`);
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
