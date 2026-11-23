// npm run whatsapp:link -- <número> [--dono <provider:conta>]
// Cadastra o número pessoal do usuário na conta WhatsApp dele (feature 003, interfaces/cli-whatsapp.md).
import { parseArgs } from "node:util";
import {
  createLinkWhatsAppNumber,
  createPgIdentityRepository,
  createPgWhatsAppAccountRepository,
  createResolveUserByChannelAccount,
  type LinkResult,
} from "../modules/identity/index.js";
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

export async function runLink(command: LinkCommand, pool: Pool): Promise<LinkResult> {
  const owner = await createResolveUserByChannelAccount(createPgIdentityRepository(pool))(command.owner.provider, command.owner.accountId);
  if (!owner) throw new UsageError(`Dono não encontrado: ${command.owner.provider}:${command.owner.accountId}.`);
  return createLinkWhatsAppNumber(createPgWhatsAppAccountRepository(pool))(owner.userId, command.number);
}

const HEADLINE: Record<LinkResult["outcome"], string> = {
  linked: "conta WhatsApp ativa",
  replaced: "número da conta WhatsApp trocado",
  unchanged: "já cadastrado, nada mudou",
};

/** Saída sempre com o número mascarado (RNF de privacidade). */
export function formatLink(result: LinkResult): string {
  return [`Número cadastrado: ${maskPhone(result.phone)} (${HEADLINE[result.outcome]})`, `Conversas importadas nesta conta: ${result.importedSources}`].join(
    "\n",
  );
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
