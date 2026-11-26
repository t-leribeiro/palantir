// T014: fatia S3 ponta a ponta com PostgreSQL real e o provedor WhatsApp simulado, no modo de um número
// (PALANTIR_WHATSAPP_CAPTURE=agent). Autorizar o grupo de teste com consentimento, ver a mensagem do grupo
// na resposta do agente, nada fora do grupo autorizado, revogação imediata e importação posterior sem duplicar.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSimulatedProvider, type SimulatedProvider } from "../../src/channels/whatsapp/provider/simulated-provider.js";
import type { IncomingDirect, IncomingGroupMessage } from "../../src/channels/whatsapp/provider/provider.js";
import { buildWhatsApp, startWorker, type WhatsAppHandle, type WorkerHandle } from "../../src/main/compose.js";
import { runImport } from "../../src/main/import.js";
import { seedOperator } from "../../src/main/seed-data.js";
import { parseGroupsArgs, runGroups } from "../../src/main/whatsapp-groups.js";
import { linkVerified } from "../support/link.js";
import { NO_EVIDENCE_TEXT } from "../../src/modules/agent/index.js";
import { loadConfig } from "../../src/platform/config.js";
import { createLogger } from "../../src/platform/logging/logger.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";

const sample = fileURLToPath(new URL("../fixtures/whatsapp-export/android-pt-br.txt", import.meta.url));
const noop = () => undefined;
const metrics = { ingestion: noop, channelInvalid: noop, job: noop, ask: noop };
const OWNER = { provider: "fake", accountId: "fake-operator" };
const ME = "+5511988887777";
const MY_CHAT = "5511988887777@s.whatsapp.net";
const ANA = "+5511977776666";
const GROUP = "120363000000000001@g.us";
const OTHER = "120363000000000002@g.us";
const CONSENT = "todos avisados no grupo em 23/11, ninguém se opôs";

let db: TestDatabase;
let worker: WorkerHandle;
let whatsapp: WhatsAppHandle;
let provider: SimulatedProvider;
let tmp: string;
let seq = 0;
const logLines: string[] = [];
const logger = createLogger({ level: "debug", destination: { write: (line: string) => void logLines.push(line) } });

const groupMessage = (overrides: Partial<IncomingGroupMessage> = {}): IncomingGroupMessage => ({
  id: `GRP-${(seq += 1)}`,
  groupId: GROUP,
  senderPhone: ANA,
  senderName: "Ana Souza",
  kind: "text",
  text: "recomendo o Pyroscope para profiling contínuo",
  sentAt: new Date(),
  ...overrides,
});

const direct = (text: string): IncomingDirect => ({ id: `DM-${(seq += 1)}`, chatJid: MY_CHAT, senderPhone: ME, kind: "text", text, sentAt: new Date() });

async function ask(text: string): Promise<string> {
  provider.clearSent();
  await provider.deliver(direct(text));
  return provider.sent().map((s) => s.text).join("\n");
}

/** Pergunta até a resposta conter `expected` (o worker indexa em segundos) ou estourar o prazo da RNF (10 s). */
async function askUntil(text: string, expected: string, timeoutMs = 10_000): Promise<{ reply: string; elapsedMs: number }> {
  const started = Date.now();
  let reply = "";
  while (Date.now() - started < timeoutMs) {
    reply = await ask(text);
    if (reply.includes(expected)) return { reply, elapsedMs: Date.now() - started };
    await new Promise((r) => setTimeout(r, 250));
  }
  return { reply, elapsedMs: Date.now() - started };
}

async function countMessages(like: string): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM messages WHERE text ILIKE $1", [`%${like}%`]);
  return rows[0]?.n ?? 0;
}

const localMinute = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const exportLine = (at: Date, author: string, text: string) => `${localMinute.format(at).replace(",", "")} - ${author}: ${text}`;

beforeAll(async () => {
  db = await startTestDatabase();
  tmp = await mkdtemp(join(tmpdir(), "palantir-s3-"));
  await seedOperator(db.pool);
  const config = loadConfig({ DATABASE_URL: db.url, PALANTIR_WHATSAPP_BURST_MS: "0", LOG_LEVEL: "error", PALANTIR_WHATSAPP_CAPTURE: "agent" });
  worker = await startWorker(config, { metrics });
  await runImport({ file: sample, conversation: "Grupo de teste", timeZone: "America/Sao_Paulo", owner: OWNER }, db.pool, db.url);
  await linkVerified({ number: "+55 11 98888-7777", owner: OWNER }, db.pool);
  provider = createSimulatedProvider();
  whatsapp = await buildWhatsApp(config, { provider, metrics, logger });
  provider.setGroups([
    { groupId: GROUP, subject: "Grupo de teste ao vivo", participants: 5 },
    { groupId: OTHER, subject: "Outro grupo", participants: 3 },
  ]);
});

afterAll(async () => {
  await whatsapp?.close();
  await worker?.close();
  await db?.stop();
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

describe("S3: captura ao vivo de um grupo de teste autorizado", () => {
  it("o diretório mostra os grupos do número, todos sem autorização", async () => {
    await expect
      .poll(async () => {
        const result = await runGroups(parseGroupsArgs([]), db.pool);
        return result.action === "listar" ? result.listing.groups.map((g) => [g.subject, g.status.kind]) : [];
      })
      .toEqual([
        ["Grupo de teste ao vivo", "not_authorized"],
        ["Outro grupo", "not_authorized"],
      ]);
  });

  it("antes da autorização, nada do grupo é guardado", async () => {
    await provider.deliverGroup(groupMessage({ text: "Kibana antes da autorização" }));
    expect(await countMessages("Kibana")).toBe(0);
  });

  it("autorizar exige consentimento e confirmação de nome diferente; liga o grupo à conversa importada", async () => {
    await expect(runGroups(parseGroupsArgs(["autorizar", "1"]), db.pool)).rejects.toThrow(/--consentimento/);
    await expect(runGroups(parseGroupsArgs(["autorizar", "1", "--consentimento", CONSENT, "--conversa", "Grupo de teste"]), db.pool)).rejects.toThrow(
      /O grupo 1 é "Grupo de teste ao vivo", mas a conversa é "Grupo de teste"/,
    );
    const result = await runGroups(parseGroupsArgs(["autorizar", "1", "--consentimento", CONSENT, "--conversa", "Grupo de teste", "--confirmar"]), db.pool);
    expect(result).toMatchObject({ action: "autorizar", result: { sourceTitle: "Grupo de teste", linkedToImport: true } });
  });

  it("mensagem do grupo aparece na resposta em até 10 s, com autor, conversa e data; nada vai para o grupo", async () => {
    await provider.deliverGroup(groupMessage());
    const { reply, elapsedMs } = await askUntil("quem recomendou o Pyroscope?", "Ana Souza");
    expect(reply).toContain("Ana Souza");
    expect(reply).toContain("Grupo de teste");
    expect(reply).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(elapsedMs).toBeLessThan(10_000);
    expect(provider.sent().every((s) => s.chatJid === MY_CHAT)).toBe(true);
  });

  it("a mesma mensagem reentregue pelo WhatsApp é guardada uma vez só", async () => {
    const message = groupMessage({ text: "deploy do Loki amanhã cedo" });
    await provider.deliverGroup(message);
    await provider.deliverGroup(message);
    await provider.deliverGroup(message);
    expect(await countMessages("deploy do Loki")).toBe(1);
  });

  it("mensagem anterior à autorização e mídia não são guardadas", async () => {
    await provider.deliverGroup(groupMessage({ text: "Graylog de ontem", sentAt: new Date(Date.now() - 3_600_000) }));
    const { text: _text, ...audio } = groupMessage({ kind: "audio" });
    const before = await countMessages("");
    await provider.deliverGroup(audio);
    expect(await countMessages("Graylog")).toBe(0);
    expect(await countMessages("")).toBe(before);
  });

  it("grupo não autorizado não é guardado e não aparece nas respostas", async () => {
    await provider.deliverGroup(groupMessage({ groupId: OTHER, text: "Zabbix no outro grupo" }));
    expect(await countMessages("Zabbix")).toBe(0);
    expect(await ask("quem falou do Zabbix?")).toBe(NO_EVIDENCE_TEXT);
  });

  it("importar depois o export do grupo não duplica o que foi capturado", async () => {
    const captured = groupMessage({ text: "vamos padronizar o OpenTelemetry Collector" });
    await provider.deliverGroup(captured);
    const file = join(tmp, "grupo.txt");
    await writeFile(
      file,
      [exportLine(captured.sentAt, "Ana", captured.text ?? ""), exportLine(new Date(captured.sentAt.getTime() + 120_000), "Bia", "e o Tempo para traces")].join("\n"),
    );
    const report = await runImport({ file, conversation: "Grupo de teste", timeZone: "America/Sao_Paulo", owner: OWNER }, db.pool, db.url);
    expect(report).toMatchObject({ reconciled: 1, imported: 1 });
    expect(await countMessages("OpenTelemetry Collector")).toBe(1);
  });

  it("revogar para a captura na hora; o que já foi guardado continua nas respostas", async () => {
    await runGroups(parseGroupsArgs(["revogar", "1"]), db.pool);
    await provider.deliverGroup(groupMessage({ text: "Nagios depois da revogação" }));
    expect(await countMessages("Nagios")).toBe(0);
    expect(await ask("quem recomendou o Pyroscope?")).toContain("Ana Souza");
  });

  it("o health mostra a captura pela sessão do agente", async () => {
    const health = await whatsapp.server.inject({ method: "GET", url: "/health" });
    expect(health.json()).toEqual({ status: "ok", checks: { db: "ok", whatsapp: "connected", capture: "connected" } });
  });

  it("os logs não têm textos, telefones, nomes de pessoas nem de grupos", () => {
    const all = logLines.join("\n");
    expect(logLines.length).toBeGreaterThan(5);
    for (const secret of ["Pyroscope", "Kibana", "Zabbix", "Loki", "5511977776666", "77776666", "5511988887777", "Ana Souza", "ao vivo", "Outro grupo", "120363"]) {
      expect(all).not.toContain(secret);
    }
  });
});

describe("S3: modo de dois números (dedicated)", () => {
  it("o número de captura não responde a mensagens diretas e tem o próprio estado no health", async () => {
    const config = loadConfig({ DATABASE_URL: db.url, PALANTIR_WHATSAPP_BURST_MS: "0", LOG_LEVEL: "error", PALANTIR_WHATSAPP_CAPTURE: "dedicated" });
    const agent = createSimulatedProvider();
    const capture = createSimulatedProvider();
    const handle = await buildWhatsApp(config, { provider: agent, captureProvider: capture, metrics, logger });
    try {
      await capture.deliver({ id: "CAP-DM-1", chatJid: MY_CHAT, senderPhone: ME, kind: "text", text: "oi", sentAt: new Date() });
      expect(capture.sent()).toEqual([]);
      capture.setState("logged_out", "401");
      const health = await handle.server.inject({ method: "GET", url: "/health" });
      expect(health.statusCode).toBe(503);
      expect(health.json()).toMatchObject({ checks: { whatsapp: "connected", capture: "logged_out" } });
    } finally {
      await handle.close();
    }
  });

  it("sem o provedor de captura, a composição recusa com mensagem clara", async () => {
    const config = loadConfig({ DATABASE_URL: db.url, PALANTIR_WHATSAPP_BURST_MS: "0", LOG_LEVEL: "error", PALANTIR_WHATSAPP_CAPTURE: "dedicated" });
    await expect(buildWhatsApp(config, { provider: createSimulatedProvider(), metrics, logger })).rejects.toThrow(/dedicated exige o provedor/);
  });
});
