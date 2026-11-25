// npm run whatsapp:link -- <número> [--dono <provider:conta>]
// Cadastra o número pessoal do usuário na conta WhatsApp dele (feature 003, interfaces/cli-whatsapp.md) e, desde a
// S5 (feature 006, D-11), mostra o código de uso único que o dono manda ao agente para verificar a conta.
// O código só aparece aqui: nunca em log, métrica ou banco (lá fica só o hash).
import { parseArgs } from "node:util";
import {
  createIssueVerificationCode,
  createLinkWhatsAppNumber,
  createPgIdentityRepository,
  createPgVerificationRepository,
  createPgWhatsAppAccountRepository,
  createResolveUserByChannelAccount,
  formatCode,
  type LinkResult,
} from "../modules/identity/index.js";
import { createPgAuditLog } from "../modules/sources/index.js";
import { createPool, type Pool } from "../platform/db/index.js";
import { DomainError, maskPhone } from "../shared/index.js";

export interface LinkCommand {
  readonly number: string;
  readonly owner: { readonly provider: string; readonly accountId: string };
}

export class UsageError extends Error {}

const USAGE = 'uso: npm run whatsapp:link -- "<número>" [--dono <provider:conta>], ex.: npm run whatsapp:link -- "+55 11 98888-7777"';

export function parseLinkArgs(argv: readonly string[]): LinkCommand {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: { dono: { type: "string", default: "fake:fake-operator" } },
  });
  const number = positionals.join(" ").trim();
  if (number === "") throw new UsageError(USAGE);
  const [provider, ...rest] = values.dono.split(":");
  if (!provider || rest.length === 0) throw new UsageError("--dono deve ter o formato provider:conta, ex.: fake:fake-operator.");
  return { number, owner: { provider, accountId: rest.join(":") } };
}

/** Resultado do vínculo com o código, quando a conta precisa ser verificada. */
export interface LinkOutput extends LinkResult {
  readonly code?: string;
  readonly expiresAt?: Date;
}

export async function runLink(command: LinkCommand, pool: Pool): Promise<LinkOutput> {
  const owner = await createResolveUserByChannelAccount(createPgIdentityRepository(pool))(command.owner.provider, command.owner.accountId);
  if (!owner) throw new UsageError(`Dono não encontrado: ${command.owner.provider}:${command.owner.accountId}.`);
  const result = await createLinkWhatsAppNumber(createPgWhatsAppAccountRepository(pool))(owner.userId, command.number);
  if (!result.needsVerification) return result;
  const issued = await createIssueVerificationCode(createPgVerificationRepository(pool))(result.accountId);
  await createPgAuditLog(pool).record({
    actorUserId: owner.userId,
    action: "account.link_requested",
    targetKind: "channel_account",
    targetId: result.accountId,
    channel: "cli",
  });
  return { ...result, ...issued };
}

const HEADLINE: Record<LinkResult["outcome"], string> = {
  linked: "vinculado e aguardando verificação",
  replaced: "trocado e aguardando verificação",
  pending: "aguardando verificação, com código novo",
  unchanged: "já verificado, nada mudou",
};

/** Saída sempre com o número mascarado (RNF de privacidade); o código vem só quando a conta precisa dele. */
export function formatLink(result: LinkOutput): string {
  const lines = [`Número ${maskPhone(result.phone)}: ${HEADLINE[result.outcome]}.`, `Conversas importadas nesta conta: ${result.importedSources}`];
  if (result.code) {
    lines.push(
      "",
      "Mande este código ao agente pelo WhatsApp, deste número, em até 10 minutos:",
      "",
      `    ${formatCode(result.code)}`,
      "",
      "Depois de 5 tentativas erradas, ou passado o prazo, rode este comando de novo para um código novo.",
    );
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new UsageError("DATABASE_URL não definido. Rode `npm run setup` para gerar o .env.");
  const command = parseLinkArgs(process.argv.slice(2));
  const pool = createPool(databaseUrl);
  try {
    process.stdout.write(`${formatLink(await runLink(command, pool))}\n`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("src/main/whatsapp-link.ts")) {
  main().catch((error: unknown) => {
    const expected = error instanceof UsageError || error instanceof DomainError;
    console.error(expected ? (error as Error).message : "Falha inesperada no cadastro; nada foi alterado.");
    if (!expected) console.error((error as Error).name);
    process.exit(1);
  });
}
