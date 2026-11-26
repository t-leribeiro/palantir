// T018: fatia S4 ponta a ponta com PostgreSQL e SeaweedFS reais, o motor de transcrição falso e o provedor
// WhatsApp simulado (modo de um número). Áudio importado e ao vivo respondido com o ponto do trecho, nada
// baixado de grupo não autorizado, o mesmo áudio pelos dois caminhos citado uma vez, transcrição pausável.
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZipFile } from "yazl";
import { createSimulatedProvider, type SimulatedProvider } from "../../src/channels/whatsapp/provider/simulated-provider.js";
import { buildWhatsApp, startWorker, type WhatsAppHandle, type WorkerHandle } from "../../src/main/compose.js";
import { runImport } from "../../src/main/import.js";
import { seedOperator } from "../../src/main/seed-data.js";
import { parseGroupsArgs, runGroups } from "../../src/main/whatsapp-groups.js";
import { linkVerified } from "../support/link.js";
import { loadConfig, type AppConfig } from "../../src/platform/config.js";
import { createLogger } from "../../src/platform/logging/logger.js";
import { saying, syntheticOpus } from "../support/audio.js";
import { startTestObjectStorage, type TestObjectStorage } from "../support/object-storage.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";

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
let s3: TestObjectStorage;
let config: AppConfig;
let worker: WorkerHandle | undefined;
let whatsapp: WhatsAppHandle;
let provider: SimulatedProvider;
let tmp: string;
let seq = 0;
const logLines: string[] = [];
const logger = createLogger({ level: "debug", destination: { write: (line: string) => void logLines.push(line) } });

async function zipWith(name: string, files: Record<string, Uint8Array | string>): Promise<string> {
  const path = join(tmp, name);
  const zip = new ZipFile();
  for (const [entry, content] of Object.entries(files)) zip.addBuffer(Buffer.from(content), entry);
  zip.end();
  await new Promise<void>((resolve, reject) => {
    zip.outputStream.pipe(createWriteStream(path)).on("close", () => resolve()).on("error", reject);
  });
  return path;
}

const localMinute = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const exportLine = (at: Date, author: string, text: string) => `${localMinute.format(at).replace(",", "")} - ${author}: ${text}`;

async function ask(text: string): Promise<string> {
  provider.clearSent();
  await provider.deliver({ id: `DM-${(seq += 1)}`, chatJid: MY_CHAT, senderPhone: ME, kind: "text", text, sentAt: new Date() });
  return provider.sent().map((s) => s.text).join("\n");
}

async function askUntil(text: string, expected: string, timeoutMs = 20_000): Promise<string> {
  const started = Date.now();
  let reply = "";
  while (Date.now() - started < timeoutMs) {
    reply = await ask(text);
    if (reply.includes(expected)) return reply;
    await new Promise((r) => setTimeout(r, 300));
  }
  return reply;
}

const importFile = (file: string, conversation: string, media = config.media) =>
  runImport({ file, conversation, timeZone: "America/Sao_Paulo", owner: OWNER }, db.pool, db.url, media);

async function attachmentStatuses(): Promise<Record<string, number>> {
  const { rows } = await db.pool.query<{ processing_status: string; n: number }>("SELECT processing_status, count(*)::int AS n FROM attachments GROUP BY 1");
  return Object.fromEntries(rows.map((r) => [r.processing_status, r.n]));
}

beforeAll(async () => {
  [db, s3] = await Promise.all([startTestDatabase(), startTestObjectStorage()]);
  tmp = await mkdtemp(join(tmpdir(), "palantir-s4-"));
  await seedOperator(db.pool);
  config = loadConfig({
    PALANTIR_WHATSAPP_BURST_MS: "0",
    DATABASE_URL: db.url,
    LOG_LEVEL: "debug",
    PALANTIR_WHATSAPP_CAPTURE: "agent",
    PALANTIR_TRANSCRIBER: "fake",
    PALANTIR_MEDIA_KEY: Buffer.alloc(32, 6).toString("base64"),
    S3_ENDPOINT: s3.endpoint,
    S3_BUCKET: s3.bucket,
    S3_ACCESS_KEY: s3.accessKey,
    S3_SECRET_KEY: s3.secretKey,
  });
  worker = await startWorker(config, { metrics, logger });
  await linkVerified({ number: "+55 11 98888-7777", owner: OWNER }, db.pool);
  provider = createSimulatedProvider();
  whatsapp = await buildWhatsApp(config, { provider, metrics, logger });
  provider.setGroups([
    { groupId: GROUP, subject: "T3", participants: 5 },
    { groupId: OTHER, subject: "Outro grupo", participants: 3 },
  ]);
}, 240_000);

afterAll(async () => {
  await whatsapp?.close();
  await worker?.close();
  await Promise.all([db?.stop(), s3?.stop()]);
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

describe("S4: perguntar sobre o que foi dito em áudios", () => {
  it("RF-01, RF-09: áudio importado é transcrito e citado com a duração e o ponto do trecho", async () => {
    const at = new Date("2026-11-12T13:01:00Z");
    const script = [
      { start: 0, end: 30, text: "bom dia pessoal, recado rápido" },
      { start: 30, end: 75, text: "a gente vai usar o Temporal para orquestrar os fluxos de cobrança" },
    ];
    const file = await zipWith("t3.zip", {
      "Conversa do WhatsApp com T3.txt": [
        exportLine(new Date("2026-11-12T13:00:00Z"), "Bruno", "bom dia"),
        exportLine(at, "Ana Souza", "PTT-20261112-WA0001.opus (arquivo anexado)"),
        exportLine(new Date("2026-11-12T13:02:00Z"), "Bruno", "PTT-20261112-WA0002.opus (arquivo anexado)"),
      ].join("\n"),
      "PTT-20261112-WA0001.opus": syntheticOpus({ seconds: 102, script }),
    });
    const report = await importFile(file, "T3");
    expect(report).toMatchObject({ imported: 3, audiosLinked: 1, audiosMissing: 1, audiosQueued: 1 });

    const reply = await askUntil("em qual áudio falaram de Temporal?", "áudio de");
    expect(reply).toContain("Ana Souza em T3, 12/11/2026, áudio de 1:42, aos 0:00:");
    expect(reply).toContain("Temporal para orquestrar");
  });

  it("áudio ausente no export fica indisponível e não é transcrito", async () => {
    const { rows } = await db.pool.query<{ storage_status: string; unavailable_reason: string; processing_status: string }>(
      "SELECT storage_status, unavailable_reason, processing_status FROM attachments WHERE storage_status = 'unavailable'",
    );
    expect(rows).toEqual([{ storage_status: "unavailable", unavailable_reason: "missing_in_export", processing_status: "not_applicable" }]);
  });

  it("RF-03, RN-01: áudio do grupo autorizado é respondido; de grupo não autorizado nada é baixado", async () => {
    const authorized = await runGroups(parseGroupsArgs(["autorizar", GROUP, "--consentimento", CONSENT, "--conversa", "T3"]), db.pool);
    expect(authorized.action).toBe("autorizar");

    await provider.deliverGroupAudio(
      { id: "LIVE-A1", groupId: OTHER, senderPhone: ANA, senderName: "Ana Souza", sentAt: new Date() },
      { bytes: syntheticOpus({ ...saying("Kubernetes no outro grupo", 5), salt: "outro" }), seconds: 5 },
    );
    await provider.deliverGroupAudio(
      { id: "LIVE-A2", groupId: GROUP, senderPhone: ANA, senderName: "Ana Souza", sentAt: new Date() },
      { bytes: syntheticOpus({ ...saying("vamos subir o Grafana Pyroscope amanhã", 30), salt: "vivo" }), seconds: 30 },
    );
    expect(provider.downloads()).toEqual(["sim-LIVE-A2"]);

    const reply = await askUntil("em qual áudio falaram do Pyroscope?", "Pyroscope");
    expect(reply).toContain("Ana Souza em T3");
    expect(reply).toContain("áudio de 0:30, aos 0:00");
    expect(await ask("em qual áudio falaram de Kubernetes?")).toContain("Não encontrei áudio sobre isso.");
  });

  it("RN-04, RF-05: o mesmo áudio pela captura e pela importação fica uma vez só", async () => {
    const sentAt = new Date();
    const bytes = syntheticOpus({ ...saying("o orçamento do Datadog estourou", 8), salt: "mesmo" });
    await provider.deliverGroupAudio({ id: "LIVE-A3", groupId: GROUP, senderPhone: ANA, senderName: "Ana Souza", sentAt }, { bytes, seconds: 8 });
    await askUntil("em qual áudio falaram do Datadog?", "Datadog");

    const file = await zipWith("t3-depois.zip", {
      "chat.txt": exportLine(sentAt, "Ana", "PTT-20261123-WA0009.opus (arquivo anexado)"),
      "PTT-20261123-WA0009.opus": bytes,
    });
    const report = await importFile(file, "T3");
    expect(report).toMatchObject({ reconciled: 1, audiosLinked: 1, audiosQueued: 0 });
    const reply = await ask("em qual áudio falaram do Datadog?");
    expect(reply).toContain("Encontrei 1 mensagem sobre isso");
    const { rows } = await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM attachments WHERE sha256 IS NOT NULL GROUP BY sha256 ORDER BY 1 DESC LIMIT 1");
    expect(rows[0]?.n).toBe(1);
  });

  it("RF-14: com a transcrição desligada, o áudio fica guardado e pendente; ao religar, a fila retoma", async () => {
    await worker?.close();
    worker = await startWorker({ ...config, media: { ...config.media, transcription: { ...config.media.transcription, enabled: false } } }, { metrics, logger });
    const file = await zipWith("pausa.zip", {
      "chat.txt": exportLine(new Date("2026-11-13T15:00:00Z"), "Bruno", "PTT-20261113-WA0010.opus (arquivo anexado)"),
      "PTT-20261113-WA0010.opus": syntheticOpus({ ...saying("falando do Terraform Cloud", 6), salt: "pausa" }),
    });
    expect(await importFile(file, "T3")).toMatchObject({ audiosQueued: 1 });
    await new Promise((r) => setTimeout(r, 1500));
    expect((await attachmentStatuses()).pending).toBe(1);
    expect(await ask("em qual áudio falaram do Terraform?")).toContain("Não encontrei áudio sobre isso.");

    await worker.close();
    await db.pool.query("DELETE FROM pgboss.job WHERE name = 'media.process'"); // job expirado enquanto desligado
    worker = await startWorker(config, { metrics, logger });
    expect(await askUntil("em qual áudio falaram do Terraform?", "Terraform")).toContain("Bruno em T3");
    expect((await attachmentStatuses()).pending ?? 0).toBe(0);
  });

  it("logs sem texto transcrito, sem nome de arquivo de mídia e sem telefone", () => {
    const logs = logLines.join("\n");
    for (const secret of ["Temporal para orquestrar", "Pyroscope amanhã", "Datadog estourou", "Terraform Cloud", "PTT-", "5511977776666", "5511988887777"]) {
      expect(logs).not.toContain(secret);
    }
    expect(logs).toContain("mídia processada");
  });
});
