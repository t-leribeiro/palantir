// Feature 003 (S2) com PostgreSQL real: recibos de perguntas (T004) e cadastro do número (T007).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runLink } from "../../src/main/whatsapp-link.js";
import { seedOperator } from "../../src/main/seed-data.js";
import { createPgInboundReceipts } from "../../src/modules/agent/index.js";
import { createPgIdentityRepository, createResolveUserByChannelAccount } from "../../src/modules/identity/index.js";
import { createEnsureImportSource, createPgImportSourceRepository } from "../../src/modules/sources/index.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";

let db: TestDatabase;

beforeAll(async () => {
  db = await startTestDatabase();
});

afterAll(async () => {
  await db?.stop();
});

describe("recibos de perguntas ao agente (D-13)", () => {
  it("registra o id uma vez só; o segundo registro devolve falso", async () => {
    const receipts = createPgInboundReceipts(db.pool);
    expect(await receipts.registerIfNew("whatsapp", "MSG-1")).toBe(true);
    expect(await receipts.registerIfNew("whatsapp", "MSG-1")).toBe(false);
    expect(await receipts.registerIfNew("fake", "MSG-1")).toBe(true);
  });

  it("não guarda texto nem remetente", async () => {
    const { rows } = await db.pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'agent_inbound_receipts' ORDER BY column_name",
    );
    expect(rows.map((r) => r.column_name)).toEqual(["external_message_id", "provider", "received_at"]);
  });

  it("a limpeza apaga só os recibos mais antigos que o limite", async () => {
    const receipts = createPgInboundReceipts(db.pool);
    await db.pool.query("INSERT INTO agent_inbound_receipts (provider, external_message_id, received_at) VALUES ('whatsapp', 'OLD', now() - interval '8 days')");
    await receipts.registerIfNew("whatsapp", "NEW");
    const removed = await receipts.purgeOlderThan(new Date(Date.now() - 7 * 24 * 3600 * 1000));
    expect(removed).toBe(1);
    expect(await receipts.registerIfNew("whatsapp", "NEW")).toBe(false);
    expect(await receipts.registerIfNew("whatsapp", "OLD")).toBe(true);
  });
});

describe("cadastro do número pessoal (T007)", () => {
  const owner = { provider: "fake", accountId: "fake-operator" };

  it("ativa a conta provisória da importação, mantém a conversa e resolve o usuário pelo número", async () => {
    await seedOperator(db.pool);
    const resolve = createResolveUserByChannelAccount(createPgIdentityRepository(db.pool));
    const operator = await resolve("fake", "fake-operator");
    if (!operator) throw new Error("seed sem operador");
    const imported = await createEnsureImportSource(createPgImportSourceRepository(db.pool))(operator, "Comunidade DevOps");

    const result = await runLink({ number: "+55 11 98888-7777", owner }, db.pool);
    expect(result).toEqual({ outcome: "linked", phone: "+5511988887777", importedSources: 1 });
    expect(await resolve("whatsapp", "+5511988887777")).toEqual(operator);

    const again = await createEnsureImportSource(createPgImportSourceRepository(db.pool))(operator, "Comunidade DevOps");
    expect(again).toMatchObject({ sourceId: imported.sourceId, accountId: "+5511988887777", created: false });
    const { rows } = await db.pool.query("SELECT count(*)::int AS n FROM channel_accounts WHERE provider = 'whatsapp'");
    expect(rows[0].n).toBe(1);
  });

  it("repetir é idempotente e outro dono não consegue o mesmo número", async () => {
    expect((await runLink({ number: "5511988887777", owner }, db.pool)).outcome).toBe("unchanged");
    await db.pool.query(
      `WITH u AS (INSERT INTO users (display_name) VALUES ('Outra pessoa') RETURNING id),
            s AS (INSERT INTO knowledge_spaces (owner_user_id, kind) SELECT id, 'personal' FROM u)
       INSERT INTO channel_accounts (user_id, provider, external_account_id, status) SELECT id, 'fake', 'outra', 'active' FROM u`,
    );
    await expect(runLink({ number: "+55 11 98888-7777", owner: { provider: "fake", accountId: "outra" } }, db.pool)).rejects.toMatchObject({
      code: "already_linked",
    });
  });
});
