// T004 (feature 008): "mostra a N" ponta a ponta com PostgreSQL e SeaweedFS reais, o motor de transcrição falso e
// o provedor WhatsApp simulado. Cenários de aceite do requirements.md#7. As citações vencidas (2 h) e o áudio sem
// arquivo guardado ficam nos testes unitários do serviço e do compositor: aqui não dá para esperar 2 h, e um áudio
// sem arquivo nunca é transcrito, então nunca vira citação.
import { createHash } from "node:crypto";
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
import { loadConfig, type AppConfig } from "../../src/platform/config.js";
import { createLogger } from "../../src/platform/logging/logger.js";
import { syntheticOpus } from "../support/audio.js";
import { linkVerified } from "../support/link.js";
import { startTestObjectStorage, type TestObjectStorage } from "../support/object-storage.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";

const noop = () => undefined;
const metrics = { ingestion: noop, channelInvalid: noop, job: noop, ask: noop };
const OWNER = { provider: "fake", accountId: "fake-operator" };
const ME = "+5511988887777";
const MY_CHAT = "5511988887777@s.whatsapp.net";

const LONG =
  "Recomendo o Temporal para orquestrar os fluxos de cobrança: ele guarda o estado de cada passo, refaz o que falhou " +
  "sem duplicar o pagamento e deixa ver no painel onde cada cobrança parou. Testamos com o Step Functions também, mas " +
  "ficaria preso na AWS e o custo por transição pesa no volume que temos. O ponto fraco é operar o cluster do Temporal, " +
  "então eu começaria pelo Temporal Cloud e só traria para dentro se o custo justificar.";
const SCRIPT = [
  { start: 0, end: 30, text: "bom dia pessoal, recado rápido sobre o deploy" },
  { start: 30, end: 75, text: "o SLA do Pyroscope caiu ontem à noite e já abrimos o chamado" },
  { start: 75, end: 102, text: "qualquer coisa me chamem por aqui" },
];
const AUDIO = syntheticOpus({ seconds: 102, script: SCRIPT });

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
const minute = (m: number) => new Date(Date.UTC(2026, 10, 12, 13, m));

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

beforeAll(async () => {
  [db, s3] = await Promise.all([startTestDatabase(), startTestObjectStorage()]);
  tmp = await mkdtemp(join(tmpdir(), "palantir-s7-"));
  await seedOperator(db.pool);
  config = loadConfig({
    PALANTIR_WHATSAPP_BURST_MS: "0",
    DATABASE_URL: db.url,
    LOG_LEVEL: "debug",
    PALANTIR_TRANSCRIBER: "fake",
    PALANTIR_MEDIA_KEY: Buffer.alloc(32, 8).toString("base64"),
    S3_ENDPOINT: s3.endpoint,
    S3_BUCKET: s3.bucket,
    S3_ACCESS_KEY: s3.accessKey,
    S3_SECRET_KEY: s3.secretKey,
  });
  worker = await startWorker(config, { metrics, logger });
  await linkVerified({ number: "+55 11 98888-7777", owner: OWNER }, db.pool);
  provider = createSimulatedProvider();
  whatsapp = await buildWhatsApp(config, { provider, metrics, logger });

  const file = await zipWith("t3.zip", {
    "Conversa do WhatsApp com T3.txt": [
      exportLine(minute(0), "Bruno", "bom dia, pessoal"),
      exportLine(minute(1), "Carla", "alguém já usou orquestrador de fluxo?"),
      exportLine(minute(2), "Ana Souza", LONG),
      exportLine(minute(3), "Bruno", "faz sentido, vou olhar o Temporal Cloud"),
      exportLine(minute(4), "Carla", "valeu, Ana"),
      exportLine(minute(6), "Ana Souza", "PTT-20261112-WA0001.opus (arquivo anexado)"),
      exportLine(minute(7), "Bruno", "obrigado pelo aviso"),
    ].join("\n"),
    "PTT-20261112-WA0001.opus": AUDIO,
  });
  expect(await runImport({ file, conversation: "T3", timeZone: "America/Sao_Paulo", owner: OWNER }, db.pool, db.url, config.media)).toMatchObject({ audiosQueued: 1 });
  await askUntil("em qual áudio falaram do Pyroscope?", "Pyroscope");
}, 240_000);

afterAll(async () => {
  await whatsapp?.close();
  await worker?.close();
  await Promise.all([db?.stop(), s3?.stop()]);
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

describe("S7: ver a mensagem original com contexto", () => {
  it("RF-03, RF-04: 'mostra a 1' traz a mensagem inteira e a conversa em volta, com a citada marcada", async () => {
    expect(await ask("quem recomendou o Temporal?")).toContain("Ana Souza em T3");
    const shown = await ask("Mostra a 1");
    expect(shown).toContain("[1] Ana Souza em T3, 12/11/2026 às 10:02");
    expect(shown).toContain(LONG);
    expect(shown).toContain("Conversa em volta:");
    expect(shown).toContain("10:00 Bruno: bom dia, pessoal");
    expect(shown).toMatch(/» 10:02 Ana Souza: Recomendo o Temporal/);
    expect(shown).toContain("10:04 Carla: valeu, Ana");
    expect(shown).not.toContain("obrigado pelo aviso");
    expect(provider.sentAudios()).toEqual([]);
  });

  it("RF-05, RF-06: 'ver 1' de um áudio traz a transcrição marcada e, depois, o próprio arquivo", async () => {
    await ask("em qual áudio falaram do Pyroscope?");
    const shown = await ask("ver 1");
    expect(shown).toContain("áudio de 1:42");
    expect(shown).toContain("0:00 bom dia pessoal, recado rápido sobre o deploy");
    expect(shown).toMatch(/» 0:30 o SLA do Pyroscope caiu/);
    expect(shown).toContain("Mando o áudio em seguida.");
    const sha256 = createHash("sha256").update(AUDIO).digest("hex");
    expect(provider.sentAudios()).toEqual([{ chatJid: MY_CHAT, mimeType: expect.stringContaining("audio/ogg"), sizeBytes: AUDIO.length, sha256 }]);
  });

  it("RN-07: número fora da resposta não busca nada", async () => {
    await ask("quem recomendou o Temporal?");
    expect(await ask("mostra a 3")).toContain("A última resposta tem só");
  });

  it("D-03: 'não encontrei' não troca as citações; uma resposta nova troca", async () => {
    await ask("em qual áudio falaram do Pyroscope?");
    expect(await ask("quem falou de Kubernetes?")).toContain("Não encontrei");
    expect(await ask("mostra a 1")).toContain("áudio de 1:42");
    await ask("quem recomendou o Temporal?");
    expect(await ask("mostra a 1")).toContain(LONG);
  });

  it("RN-02: frase com 'mostra' que não é o comando continua sendo pergunta; a ajuda ensina o comando", async () => {
    expect(await ask("me mostra o que a Ana disse sobre o Temporal")).toContain("Encontrei");
    expect(await ask("ajuda")).toContain("mostra a 2");
  });

  it("RN-03: conversa apagada depois da resposta não é mostrada", async () => {
    await ask("quem recomendou o Temporal?");
    await db.pool.query("UPDATE sources SET status = 'deleting' WHERE title = 'T3'");
    try {
      expect(await ask("mostra a 1")).toContain("Essa conversa foi apagada");
    } finally {
      await db.pool.query("UPDATE sources SET status = 'authorized' WHERE title = 'T3'");
    }
  });

  it("RN-08: nada do que foi mostrado vai para os logs", () => {
    const logs = logLines.join("\n");
    for (const secret of ["Temporal Cloud", "Pyroscope caiu", "Ana Souza", "5511988887777"]) expect(logs).not.toContain(secret);
  });
});
