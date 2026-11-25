// T004 (feature 006): gestão de fontes conversando com o agente, ponta a ponta pelo canal de teste
// (API e worker reais, PostgreSQL em container). Cenários de requirements.md#7.
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentReply } from "../../src/contracts/channel/knowledge-channel.js";
import { buildApi, startWorker, type ApiHandle, type WorkerHandle } from "../../src/main/compose.js";
import { seedOperator } from "../../src/main/seed-data.js";
import { createIssueVerificationCode, createPgVerificationRepository } from "../../src/modules/identity/index.js";
import { loadConfig } from "../../src/platform/config.js";
import type { AppMetrics } from "../../src/platform/telemetry/index.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";
import { one } from "../support/rows.js";

let db: TestDatabase;
let api: ApiHandle;
let worker: WorkerHandle;
let baseUrl: string;
let operatorUserId: string;
let seq = 0;

const noop = () => undefined;
const metrics: AppMetrics = { ingestion: noop, channelInvalid: noop, job: noop, ask: noop };

beforeAll(async () => {
  db = await startTestDatabase();
  const operator = await seedOperator(db.pool);
  operatorUserId = operator.userId;
  await seedOperator(db.pool, { conversationId: "grupo-girassol-a", conversationTitle: "Girassóis A" });
  await seedOperator(db.pool, { conversationId: "grupo-girassol-b", conversationTitle: "Girassóis B" });
  await db.pool.query(
    `INSERT INTO whatsapp_groups (group_id, subject, participants) VALUES
       ('120363000000000101@g.us', 'Projeto X', 5), ('120363000000000102@g.us', 'Projeto Y', 3)`,
  );
  const config = loadConfig({ DATABASE_URL: db.url, PALANTIR_FAKE_CHANNEL: "true", LOG_LEVEL: "error" });
  api = await buildApi(config, { metrics });
  worker = await startWorker(config, { metrics });
  await api.server.listen({ port: 0, host: "127.0.0.1" });
  baseUrl = `http://127.0.0.1:${(api.server.server.address() as AddressInfo).port}`;
}, 240_000);

afterAll(async () => {
  await worker?.close();
  await api?.close();
  await db?.stop();
});

async function ask(text: string, senderAccountId = "fake-operator"): Promise<AgentReply> {
  const res = await fetch(`${baseUrl}/v1/channels/fake/agent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ senderAccountId, text }),
  });
  return (await res.json()) as AgentReply;
}

async function inbound(conversationId: string, text: string) {
  seq += 1;
  const res = await fetch(`${baseUrl}/v1/channels/fake/inbound`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversationId, externalMessageId: `s5-${seq}`, senderId: "ana", senderName: "Ana", text, timestamp: new Date().toISOString() }),
  });
  return (await res.json()) as { outcome?: string; error?: string };
}

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 20_000): Promise<T> {
  const started = Date.now();
  let value = await read();
  while (!done(value) && Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 250));
    value = await read();
  }
  return value;
}

const outbox = async () => ((await (await fetch(`${baseUrl}/v1/channels/fake/outbox`)).json()) as { items: { destinationAccountId: string; reply: AgentReply }[] }).items;

/** Número do item com esse nome na última lista mostrada. */
function position(list: string, title: string): string {
  const found = new RegExp(`^(\\d+)\\. ${title} · `, "m").exec(list);
  if (!found?.[1]) throw new Error(`"${title}" fora da lista:\n${list}`);
  return found[1];
}

describe("gestão de fontes pelo agente (feature 006)", () => {
  it("RF-02: lista grupos do número de captura e conversas do espaço, com o estado", async () => {
    const { text } = await ask("grupos");
    expect(text).toMatch(/Seus grupos e conversas \(1–\d+ de \d+\):/);
    expect(text).toContain("Projeto X · não acompanhado");
    expect(text).toContain("Girassóis A · conversa");
  });

  it("RF-03: acompanhar pede a confirmação de consentimento e só autoriza depois dela", async () => {
    const list = (await ask("grupos")).text;
    const asked = await ask(`acompanhar ${position(list, "Projeto X")}`);
    expect(asked.text).toContain('Para acompanhar "Projeto X"');
    expect(asked.text).toContain('Responda "confirmo"');
    expect((await ask("grupos")).text).toContain("Projeto X · não acompanhado");

    expect((await ask("confirmo")).text).toContain('"Projeto X" está sendo acompanhado');
    expect((await ask("grupos")).text).toContain("Projeto X · acompanhando");
    const capture = one((await db.pool.query<{ consent_statement: string }>("SELECT consent_statement FROM source_captures WHERE group_id = '120363000000000101@g.us'")).rows);
    expect(capture.consent_statement).toContain("Participantes informados e de acordo");
    expect(one((await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_events WHERE action = 'capture.authorized'")).rows).n).toBe(1);
  });

  it("confirmação que não chega a tempo não autoriza", async () => {
    await ask("acompanhar Projeto Y");
    await db.pool.query("UPDATE agent_conversation_state SET pending_expires_at = now() - interval '1 second'");
    expect((await ask("confirmo")).text).toContain("O pedido expirou");
    expect((await ask("grupos")).text).toContain("Projeto Y · não acompanhado");
  });

  it("RF-04: parar tem efeito imediato", async () => {
    expect((await ask("parar Projeto X")).text).toContain('Parei de acompanhar "Projeto X"');
    expect((await ask("grupos")).text).toContain("Projeto X · parado");
  });

  it("RF-08: nome ambíguo lista as opções e não age; número de lista vencida pede a lista de novo", async () => {
    const ambiguous = await ask("apagar projeto");
    expect(ambiguous.text).toContain("Encontrei mais de uma");
    expect(ambiguous.text).toContain("Projeto X");
    expect(ambiguous.text).toContain("Projeto Y");
    await ask("grupos");
    await db.pool.query("UPDATE agent_conversation_state SET listing_at = now() - interval '31 minutes'");
    expect((await ask("acompanhar 1")).text).toContain('Mande "grupos" para ver a lista atual');
  });

  it("RF-14: a pergunta que cita o nome da conversa busca só nela", async () => {
    expect(await inbound("grupo-girassol-a", "plantamos girassóis no sábado")).toMatchObject({ outcome: "accepted" });
    expect(await inbound("grupo-girassol-b", "os girassóis floresceram")).toMatchObject({ outcome: "accepted" });
    const reply = await until(
      () => ask("na Girassóis B, quem falou de girassóis?"),
      (r) => r.outcome === "answered",
    );
    expect(reply.citations.map((c) => c.sourceTitle)).toEqual(["Girassóis B"]);
  });

  it("RF-05 e RF-07: apagar exige o nome, some na hora, avisa ao terminar e recusa mensagens novas", async () => {
    await until(() => ask("quem falou de girassóis?"), (r) => r.citations.length === 2);
    const asked = await ask("apagar Girassóis A");
    expect(asked.text).toContain('Para confirmar, responda "confirmo apagar Girassóis A"');
    expect((await ask("confirmo apagar Girassóis B")).text).toContain('a confirmação precisa ser "confirmo apagar Girassóis A"');

    await fetch(`${baseUrl}/v1/channels/fake/outbox`, { method: "DELETE" });
    expect((await ask("confirmo apagar Girassóis A")).text).toContain('Apagando "Girassóis A"');
    expect((await ask("quem falou de girassóis?")).citations.map((c) => c.sourceTitle)).toEqual(["Girassóis B"]);
    expect((await inbound("grupo-girassol-a", "mais girassóis")).outcome).not.toBe("accepted");

    const items = await until(outbox, (list) => list.some((i) => i.reply.text.startsWith("Terminei de apagar")));
    const notice = items.find((i) => i.reply.text.startsWith("Terminei de apagar"));
    expect(notice?.destinationAccountId).toBe("fake-operator");
    expect(notice?.reply.text).toContain('"Girassóis A": 1 mensagem');
    expect((await ask("grupos")).text).not.toContain("Girassóis A");
    const actions = (await db.pool.query<{ action: string }>("SELECT action FROM audit_events WHERE target_kind = 'source' ORDER BY at")).rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["source.deletion_requested", "source.deleted"]));
  });

  it("RF-01: conta pendente só recebe a instrução até mandar o código certo", async () => {
    const pending = await seedOperator(db.pool, { accountId: "fake-pendente", displayName: "Pendente", conversationId: "grupo-pendente", conversationTitle: "Do pendente" });
    await db.pool.query("UPDATE channel_accounts SET status = 'pending', verified_at = NULL WHERE id = $1", [pending.accountId]);

    expect((await ask("grupos", "fake-pendente")).text).toContain("Sua conta ainda não foi verificada");
    const { code } = await createIssueVerificationCode(createPgVerificationRepository(db.pool))(pending.accountId);
    const wrong = code === "000000" ? "111111" : "000000";
    expect((await ask(wrong, "fake-pendente")).text).toContain("Código incorreto. Restam 4 tentativas.");
    expect((await ask(code, "fake-pendente")).text).toContain("Conta verificada");
    expect((await ask("grupos", "fake-pendente")).text).toContain("Do pendente · conversa");
    expect(operatorUserId).not.toBe(pending.userId);
  });
});
