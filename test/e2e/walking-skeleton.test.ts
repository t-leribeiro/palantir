// T028 / RF-15: caminho ponta a ponta do walking skeleton, com API e worker reais, PostgreSQL em
// container e HTTP de verdade: mensagem → ingestão → indexação → pergunta → resposta com citação.
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApi, startWorker, type ApiHandle, type WorkerHandle } from "../../src/main/compose.js";
import { seedOperator } from "../../src/main/seed-data.js";
import { loadConfig } from "../../src/platform/config.js";
import type { AgentReply } from "../../src/contracts/channel/knowledge-channel.js";
import type { AppMetrics } from "../../src/platform/telemetry/index.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";

let db: TestDatabase;
let api: ApiHandle;
let worker: WorkerHandle;
let baseUrl: string;
const recorded: { ingestion: string[]; invalid: number } = { ingestion: [], invalid: 0 };

const metrics: AppMetrics = {
  ingestion: (outcome, reason) => recorded.ingestion.push(reason ? `${outcome}:${reason}` : outcome),
  channelInvalid: () => {
    recorded.invalid += 1;
  },
  job: () => undefined,
  ask: () => undefined,
};

beforeAll(async () => {
  db = await startTestDatabase();
  await seedOperator(db.pool);
  await seedOperator(db.pool, { conversationId: "grupo-fechado", conversationTitle: "Fechado", sourceStatus: "not_authorized" });
  await seedOperator(db.pool, { accountId: "outro-usuario", conversationId: "grupo-do-outro", conversationTitle: "Grupo do outro", displayName: "Outro" });
  const config = loadConfig({ DATABASE_URL: db.url, PALANTIR_FAKE_CHANNEL: "true", LOG_LEVEL: "error" });
  api = await buildApi(config, { metrics });
  worker = await startWorker(config, { metrics });
  await api.server.listen({ port: 0, host: "127.0.0.1" });
  baseUrl = `http://127.0.0.1:${(api.server.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await worker?.close();
  await api?.close();
  await db?.stop();
});

beforeEach(async () => {
  await fetch(`${baseUrl}/v1/channels/fake/outbox`, { method: "DELETE" });
});

/** Corpo das respostas HTTP do esqueleto (AgentReply, resultado da ingestão ou erro). */
type Body = Partial<AgentReply> & {
  messageId?: string;
  error?: string;
  items?: { destinationAccountId: string }[];
};

let seq = 0;
async function inbound(text: string, overrides: Record<string, string> = {}) {
  seq += 1;
  const body = {
    conversationId: "fake-group-1",
    externalMessageId: `e2e-${seq}`,
    senderId: "ana",
    senderName: "Ana",
    text,
    timestamp: "2026-11-22T10:00:00-03:00",
    ...overrides,
  };
  const res = await fetch(`${baseUrl}/v1/channels/fake/inbound`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Body, sent: body };
}

async function ask(text: string, senderAccountId = "fake-operator") {
  const res = await fetch(`${baseUrl}/v1/channels/fake/agent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ senderAccountId, text }),
  });
  return { status: res.status, body: (await res.json()) as Body };
}

/** Espera a indexação assíncrona por polling (sem sleep fixo), até 30 s. */
async function askUntilAnswered(text: string, senderAccountId = "fake-operator") {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const reply = await ask(text, senderAccountId);
    if (reply.body.outcome === "answered" || Date.now() > deadline) return reply;
    await new Promise((r) => setTimeout(r, 250));
  }
}

describe("walking skeleton ponta a ponta", () => {
  it("responde com citação de autor, fonte e data", async () => {
    const sent = await inbound("O Grafana Alloy centraliza a coleta de telemetria");
    expect(sent.status).toBe(202);
    const reply = await askUntilAnswered("quem falou do Grafana Alloy?");
    expect(reply.status).toBe(200);
    expect(reply.body.outcome).toBe("answered");
    expect(reply.body.citations?.[0]).toMatchObject({
      index: 1,
      messageId: sent.body.messageId,
      author: "Ana",
      sourceTitle: "Grupo de teste",
      sentAt: "2026-11-22T13:00:00.000Z",
    });
    expect(reply.body.text).toContain("22/11/2026");
    const outbox = (await (await fetch(`${baseUrl}/v1/channels/fake/outbox`)).json()) as Body;
    expect(outbox.items?.[0]?.destinationAccountId).toBe("fake-operator");
  });

  it("responde 'não encontrei evidências suficientes' sem evidência", async () => {
    const reply = await ask("quem falou de Temporal?");
    expect(reply.body).toEqual({ text: "Não encontrei evidências suficientes.", outcome: "no_evidence", citations: [] });
  });

  it("grava 1 mensagem quando a mesma é entregue 3 vezes", async () => {
    const first = await inbound("Mensagem repetida três vezes", { externalMessageId: "e2e-dup" });
    const second = await inbound("Mensagem repetida três vezes", { externalMessageId: "e2e-dup" });
    const third = await inbound("Mensagem repetida três vezes", { externalMessageId: "e2e-dup" });
    expect([first.status, second.status, third.status]).toEqual([202, 200, 200]);
    expect(second.body.messageId).toBe(first.body.messageId);
    const { rows } = await db.pool.query("SELECT count(*)::int AS n FROM messages WHERE external_message_id = 'e2e-dup'");
    expect(rows[0].n).toBe(1);
  });

  it("recusa fonte não autorizada (403) e registra a métrica", async () => {
    const res = await inbound("não deveria entrar", { conversationId: "grupo-fechado" });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "source.not_authorized" });
    expect(recorded.ingestion).toContain("rejected:not_authorized");
  });

  it("isola espaços: um usuário nunca recebe citação do outro", async () => {
    await inbound("Kubernetes com Karpenter reduziu o custo do cluster", { conversationId: "grupo-do-outro", accountId: "outro-usuario" });
    const theirs = await askUntilAnswered("karpenter kubernetes", "outro-usuario");
    expect(theirs.body.outcome).toBe("answered");
    const mine = await ask("karpenter kubernetes");
    expect(mine.body.outcome).toBe("no_evidence");
  });

  it("rejeita mensagem fora do contrato com 400 indicando o campo", async () => {
    const res = await inbound("sem fuso", { timestamp: "2026-11-22T10:00:00" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("contract.invalid");
  });

  it("health check reporta banco e fila", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", checks: { db: "ok", queue: "ok" } });
  });
});
