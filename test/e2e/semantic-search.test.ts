// T007 (feature 007): busca pelo sentido ponta a ponta pelo canal de teste (API e worker reais, PostgreSQL em
// container, embedder falso com o léxico dos cenários). Cenários de requirements.md#7 e a higiene de logs (T022).
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentReply } from "../../src/contracts/channel/knowledge-channel.js";
import { buildApi, startWorker, type ApiHandle, type WorkerHandle } from "../../src/main/compose.js";
import { seedOperator } from "../../src/main/seed-data.js";
import { createFakeEmbedder } from "../../src/modules/knowledge/index.js";
import { loadConfig } from "../../src/platform/config.js";
import { createLogger } from "../../src/platform/logging/logger.js";
import type { AppMetrics } from "../../src/platform/telemetry/index.js";
import { TEST_CONCEPTS } from "../support/embedding-concepts.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";

let db: TestDatabase;
let api: ApiHandle;
let worker: WorkerHandle;
let baseUrl: string;
let seq = 0;
let embedderDown = false;
const logLines: string[] = [];
const ids: Record<string, string> = {};

const noop = () => undefined;
const metrics: AppMetrics = { ingestion: noop, channelInvalid: noop, job: noop, ask: noop };
const logger = createLogger({ level: "debug", destination: { write: (line: string) => void logLines.push(line) } });
const embedder = createFakeEmbedder({ concepts: TEST_CONCEPTS, down: () => embedderDown });

const TEXTS = {
  temporal: "Recomendo o Temporal para orquestrar workflows de longa duração",
  karpenter: "O Karpenter reduziu em 30% o custo do nosso cluster Kubernetes",
  alloy: "O Grafana Alloy centraliza a coleta de telemetria",
};

beforeAll(async () => {
  db = await startTestDatabase();
  await seedOperator(db.pool);
  await seedOperator(db.pool, { conversationId: "grupo-apagado", conversationTitle: "Grupo Apagado" });
  const config = loadConfig({ DATABASE_URL: db.url, PALANTIR_FAKE_CHANNEL: "true", LOG_LEVEL: "debug", PALANTIR_SEMANTIC_MIN_SIMILARITY: "0.5" });
  const search = { embedder, sweepIntervalMs: 300 };
  api = await buildApi(config, { metrics, logger, search });
  worker = await startWorker(config, { metrics, logger, search });
  await api.server.listen({ port: 0, host: "127.0.0.1" });
  baseUrl = `http://127.0.0.1:${(api.server.server.address() as AddressInfo).port}`;
  ids.temporal = await inbound("fake-group-1", TEXTS.temporal, "Diego");
  ids.karpenter = await inbound("fake-group-1", TEXTS.karpenter, "Carla");
  ids.alloy = await inbound("fake-group-1", TEXTS.alloy, "Ana");
  ids.apagado = await inbound("grupo-apagado", "Vamos cortar gastos com o servidor de testes", "Bruno");
  await until(chunkCount, (n) => n >= 4);
  await until(pendingEmbeddings, (n) => n === 0);
}, 240_000);

afterAll(async () => {
  await worker?.close();
  await api?.close();
  await db?.stop();
});

async function inbound(conversationId: string, text: string, author: string): Promise<string> {
  seq += 1;
  const res = await fetch(`${baseUrl}/v1/channels/fake/inbound`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversationId, externalMessageId: `s6-${seq}`, senderId: author.toLowerCase(), senderName: author, text, timestamp: new Date().toISOString() }),
  });
  return ((await res.json()) as { messageId: string }).messageId;
}

async function ask(text: string): Promise<AgentReply> {
  const res = await fetch(`${baseUrl}/v1/channels/fake/agent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ senderAccountId: "fake-operator", text }),
  });
  return (await res.json()) as AgentReply;
}

async function chunkCount(): Promise<number> {
  return (await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM message_chunks")).rows[0]?.n ?? 0;
}

async function pendingEmbeddings(): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM message_chunks c
      WHERE NOT EXISTS (SELECT 1 FROM chunk_embeddings e JOIN embedding_models m ON m.id = e.model_id AND m.status = 'active' WHERE e.chunk_id = c.id)`,
  );
  return rows[0]?.n ?? -1;
}

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 20_000): Promise<T> {
  const started = Date.now();
  let value = await read();
  while (!done(value) && Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 200));
    value = await read();
  }
  return value;
}

const citedIds = (reply: AgentReply) => reply.citations.map((c) => c.messageId);

describe("busca pelo sentido pelo canal de teste", () => {
  it("paráfrase é citada como as outras respostas: autor, conversa e data", async () => {
    const reply = await ask("quem sugeriu algo para coordenar processos demorados?");
    expect(reply.outcome).toBe("answered");
    expect(citedIds(reply)).toContain(ids.temporal);
    expect(reply.text).toContain("Diego");
    expect(reply.text).toContain("Grupo de teste");
  });

  it("erro de digitação acha a mensagem", async () => {
    expect(citedIds(await ask("o que disseram do karpentr?"))).toContain(ids.karpenter);
  });

  it("palavra exata continua igual", async () => {
    expect(citedIds(await ask("quem falou do Grafana Alloy?"))[0]).toBe(ids.alloy);
  });

  it("assunto ausente continua sem resposta", async () => {
    expect((await ask("alguém usou um sistema de mensageria distribuída?")).outcome).toBe("no_evidence");
  });

  it("fonte em exclusão some também da busca por sentido", async () => {
    expect(citedIds(await ask("quem quer reduzir custos do servidor?"))).toContain(ids.apagado);
    await db.pool.query("UPDATE sources SET status = 'deleting' WHERE external_conversation_id = 'grupo-apagado'");
    expect(citedIds(await ask("quem quer reduzir custos do servidor?"))).not.toContain(ids.apagado);
  });

  it("cálculo fora do ar: responde por palavra; ao voltar, a mensagem nova é achada por paráfrase sem ação manual", async () => {
    embedderDown = true;
    const before = await chunkCount();
    const novo = await inbound("fake-group-1", "Precisamos coordenar o fluxo demorado de faturamento", "Elisa");
    await until(chunkCount, (n) => n > before);
    await until(async () => (await ask("faturamento")).outcome, (o) => o === "answered");
    expect(citedIds(await ask("faturamento"))).toContain(novo);
    expect(await pendingEmbeddings()).toBeGreaterThan(0);
    embedderDown = false;
    await until(pendingEmbeddings, (n) => n === 0);
    expect(citedIds(await ask("processos lentos para orquestrar"))).toContain(novo);
  });

  it("logs sem texto de mensagem, de pergunta nem vetores", () => {
    const all = logLines.join("\n");
    for (const text of [...Object.values(TEXTS), "coordenar processos demorados", "mensageria distribuída", "faturamento"]) expect(all).not.toContain(text);
    expect(all).not.toMatch(/\[-?0\.\d+,-?0\.\d+/);
  });
});
