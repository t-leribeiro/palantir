// Vínculo do número pessoal já verificado, para os testes que não tratam da verificação (feature 006, RN-02).
import { runLink, type LinkCommand } from "../../src/main/whatsapp-link.js";
import { createPgVerificationRepository, createVerifyAccountCode } from "../../src/modules/identity/index.js";
import type { Pool } from "../../src/platform/db/index.js";

export async function linkVerified(command: LinkCommand, pool: Pool): Promise<void> {
  const linked = await runLink(command, pool);
  if (!linked.code) return;
  const outcome = await createVerifyAccountCode(createPgVerificationRepository(pool))(linked.accountId, linked.code);
  if (outcome.kind !== "verified") throw new Error(`verificação falhou: ${outcome.kind}`);
}
