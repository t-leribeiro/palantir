// T015: fatia S2 ponta a ponta com PostgreSQL real e o provedor WhatsApp simulado. Importar uma conversa,
// cadastrar o número pessoal e perguntar pelo WhatsApp; desconhecido fica sem resposta; reentrega não duplica.
// Grupos são descartados no provedor real (isIgnoredJid, coberto em test/unit/whatsapp/mapping.test.ts).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSimulatedProvider, type SimulatedProvider } from "../../src/channels/whatsapp/provider/simulated-provider.js";
import type { IncomingDirect } from "../../src/channels/whatsapp/provider/provider.js";
import { buildWhatsApp, startWorker, type WhatsAppHandle, type WorkerHandle } from "../../src/main/compose.js";
import { runImport } from "../../src/main/import.js";
import { seedOperator } from "../../src/main/seed-data.js";
import { runLink } from "../../src/main/whatsapp-link.js";
import { HELP_TEXT, TEXT_ONLY_TEXT } from "../../src/modules/agent/index.js";
import { loadConfig } from "../../src/platform/config.js";
import { createLogger } from "../../src/platform/logging/logger.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";

const sample = fileURLToPath(new URL("../fixtures/whatsapp-export/android-pt-br.txt", import.meta.url));
const noop = () => undefined;
const metrics = { ingestion: noop, channelInvalid: noop, job: noop, ask: noop };
const OWNER = { provider: "fake", accountId: "fake-operator" };
const ME = "+5511988887777";
const MY_CHAT = "5511988887777@s.whatsapp.net";

let db: TestDatabase;
let worker: WorkerHandle;
let whatsapp: WhatsAppHandle;
let provider: SimulatedProvider;
let seq = 0;
const logLines: string[] = [];
const logger = createLogger({ level: "debug", destination: { write: (line: string) => void logLines.push(line) } });

const message = (overrides: Partial<IncomingDirect> = {}): IncomingDirect => ({
  id: `E2E-${(seq += 1)}`,
  chatJid: MY_CHAT,
  senderPhone: ME,
  kind: "text",
  text: "quem recomendou o Temporal?",
  sentAt: new Date(),
  senderName: "Leandro",
  ...overrides,
});

async function sendAndCollect(input: IncomingDirect): Promise<string[]> {
  provider.clearSent();
  await provider.deliver(input);
  return provider.sent().map((s) => s.text);
}

beforeAll(async () => {
  db = await startTestDatabase();
  await seedOperator(db.pool);
  const config = loadConfig({ DATABASE_URL: db.url, LOG_LEVEL: "error" });
  worker = await startWorker(config, { metrics });
  await runImport({ file: sample, conversation: "Comunidade DevOps", timeZone: "America/Sao_Paulo", owner: OWNER }, db.pool, db.url);
  await runLink({ number: "+55 11 98888-7777", owner: OWNER }, db.pool);
  provider = createSimulatedProvider();
  whatsapp = await buildWhatsApp(config, { provider, metrics, logger });
});

afterAll(async () => {
  await whatsapp?.close();
  await worker?.close();
  await db?.stop();
});

describe("S2: perguntar pelo WhatsApp ao número do agente", () => {
  it("responde à pergunta do número cadastrado citando autor, conversa e data do histórico importado", async () => {
    const deadline = Date.now() + 30_000;
    let reply: string[] = [];
    while (Date.now() < deadline) {
      reply = await sendAndCollect(message());
      if (reply.join("\n").includes("Diego")) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const text = reply.join("\n");
    expect(text).toContain("Diego");
    expect(text).toContain("Comunidade DevOps");
    expect(text).toContain("10/11/2026");
    expect(provider.sent()[0]?.chatJid).toBe(MY_CHAT);
  });

  it("'oi' recebe a ajuda", async () => {
    expect(await sendAndCollect(message({ text: "oi" }))).toEqual([HELP_TEXT]);
  });

  it("número desconhecido não recebe nada", async () => {
    expect(await sendAndCollect(message({ senderPhone: "+5521999990000", chatJid: "5521999990000@s.whatsapp.net" }))).toEqual([]);
  });

  it("a mesma mensagem reentregue recebe uma resposta só", async () => {
    const again = message({ text: "oi" });
    expect(await sendAndCollect(again)).toHaveLength(1);
    expect(await sendAndCollect(again)).toEqual([]);
  });

  it("áudio recebe o aviso de que por enquanto só texto", async () => {
    const { text: _text, ...audio } = message({ kind: "audio" });
    expect(await sendAndCollect(audio)).toEqual([TEXT_ONLY_TEXT]);
  });

  it("perguntas não viram conhecimento", async () => {
    const { rows } = await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM messages");
    expect(rows[0]?.n).toBe(5);
  });

  it("o health mostra o estado da sessão", async () => {
    const ok = await whatsapp.server.inject({ method: "GET", url: "/health" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ status: "ok", checks: { db: "ok", whatsapp: "connected" } });
    provider.setState("logged_out", "401");
    const down = await whatsapp.server.inject({ method: "GET", url: "/health" });
    expect(down.statusCode).toBe(503);
    expect(down.json()).toMatchObject({ checks: { whatsapp: "logged_out" } });
    provider.setState("connected");
  });

  it("os logs não têm número de telefone nem texto das perguntas (RNF de privacidade)", () => {
    const all = logLines.join("\n");
    expect(logLines.length).toBeGreaterThan(5);
    for (const secret of ["5511988887777", "98888", "5521999990000", "Temporal", "recomendou"]) expect(all).not.toContain(secret);
  });

  it("com o canal desligado, o processo sai sem conectar", () => {
    const run = spawnSync(process.execPath, ["--import", "tsx", "src/main/whatsapp.ts"], {
      env: { ...process.env, PALANTIR_WHATSAPP_ENABLED: "false", DATABASE_URL: db.url, OTEL_EXPORTER_OTLP_ENDPOINT: "" },
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("canal WhatsApp desligado");
    expect(run.stdout).not.toContain("QR Code");
  });
});
