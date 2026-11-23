// T013: fatia S1 ponta a ponta. Importar uma conversa exportada, perguntar pelo canal de teste e
// receber a citação original; reimportar não duplica; arquivo malicioso não grava nada; 10.000 mensagens em ≤ 2 min.
import { createWriteStream, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ZipFile } from "yazl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentReply } from "../../src/contracts/channel/knowledge-channel.js";
import { buildApi, startWorker, type ApiHandle, type WorkerHandle } from "../../src/main/compose.js";
import { runImport, type ImportCommand } from "../../src/main/import.js";
import { seedOperator } from "../../src/main/seed-data.js";
import { loadConfig } from "../../src/platform/config.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";

const sample = fileURLToPath(new URL("../fixtures/whatsapp-export/android-pt-br.txt", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "palantir-s1-"));
const noop = () => undefined;
const metrics = { ingestion: noop, channelInvalid: noop, job: noop, ask: noop };

let db: TestDatabase;
let api: ApiHandle;
let worker: WorkerHandle;

const command = (file: string, conversation = "Comunidade DevOps"): ImportCommand => ({
  file,
  conversation,
  timeZone: "America/Sao_Paulo",
  owner: { provider: "fake", accountId: "fake-operator" },
});

beforeAll(async () => {
  db = await startTestDatabase();
  await seedOperator(db.pool);
  const config = loadConfig({ DATABASE_URL: db.url, PALANTIR_FAKE_CHANNEL: "true", LOG_LEVEL: "error" });
  api = await buildApi(config, { metrics });
  worker = await startWorker(config, { metrics });
});

afterAll(async () => {
  await worker?.close();
  await api?.close();
  await db?.stop();
});

async function ask(text: string): Promise<AgentReply> {
  const res = await api.server.inject({ method: "POST", url: "/v1/channels/fake/agent", payload: { senderAccountId: "fake-operator", text } });
  return res.json() as AgentReply;
}

async function askUntilAnswered(text: string): Promise<AgentReply> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const reply = await ask(text);
    if (reply.outcome === "answered" || Date.now() > deadline) return reply;
    await new Promise((r) => setTimeout(r, 250));
  }
}

const countMessages = async () => (await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM messages")).rows[0]?.n ?? 0;

describe("S1: perguntar ao histórico importado", () => {
  it("importa a conversa (zip) e responde citando autor, conversa e data originais", async () => {
    const zip = new ZipFile();
    zip.addBuffer(readFileSync(sample), "Conversa do WhatsApp com Comunidade DevOps.txt");
    zip.end();
    const file = join(dir, "comunidade.zip");
    const out = createWriteStream(file);
    zip.outputStream.pipe(out);
    await once(out, "close");

    const report = await runImport(command(file), db.pool, db.url);
    expect(report).toMatchObject({ imported: 5, existing: 0, systemIgnored: 3, mediaFound: 2 });

    const reply = await askUntilAnswered("quem recomendou o Temporal?");
    expect(reply.outcome).toBe("answered");
    expect(reply.citations[0]).toMatchObject({ author: "Diego", sourceTitle: "Comunidade DevOps", sentAt: "2026-11-10T13:00:00.000Z" });
    expect(reply.text).toContain("10/11/2026");
  });

  it("reimportar o mesmo arquivo não grava nada novo", async () => {
    const before = await countMessages();
    const report = await runImport(command(sample), db.pool, db.url);
    expect(report).toMatchObject({ imported: 0, existing: 5 });
    expect(await countMessages()).toBe(before);
  });

  it("mantém duas mensagens iguais do mesmo autor no mesmo minuto", async () => {
    const { rows } = await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM messages WHERE text = 'ok'");
    expect(rows[0]?.n).toBe(2);
  });

  it("arquivo malicioso é recusado sem gravar nada", async () => {
    const zip = new ZipFile();
    zip.addBuffer(Buffer.alloc(3_000_000, 0x61), "chat.txt");
    zip.end();
    const file = join(dir, "bomba.zip");
    const out = createWriteStream(file);
    zip.outputStream.pipe(out);
    await once(out, "close");
    const before = await countMessages();
    await expect(runImport(command(file, "Bomba"), db.pool, db.url)).rejects.toMatchObject({ code: "unsafe" });
    expect(await countMessages()).toBe(before);
    const { rows } = await db.pool.query("SELECT 1 FROM sources WHERE title = 'Bomba'");
    expect(rows).toHaveLength(0);
  });

  it("importa 10.000 mensagens em até 2 minutos", { timeout: 180_000 }, async () => {
    const lines = Array.from({ length: 10_000 }, (_, i) => {
      const minute = String(i % 60).padStart(2, "0");
      const hour = String(8 + Math.floor(i / 60) % 12).padStart(2, "0");
      const dayOfMonth = String(1 + Math.floor(i / 720)).padStart(2, "0");
      return `${dayOfMonth}/10/2026 ${hour}:${minute} - Autor ${i % 40}: mensagem de carga ${i} sobre arquitetura e custos`;
    });
    const file = join(dir, "grande.txt");
    writeFileSync(file, `${lines.join("\n")}\n`);
    const started = performance.now();
    const report = await runImport(command(file, "Grupo grande"), db.pool, db.url);
    const seconds = (performance.now() - started) / 1000;
    expect(report.imported).toBe(10_000);
    expect(seconds).toBeLessThanOrEqual(120);
  });
});
