// T004 (feature 009): guardar com tema ponta a ponta, com PostgreSQL e SeaweedFS reais, o motor de transcrição falso,
// o provedor WhatsApp simulado e o canal de teste. Cenários de aceite do requirements.md#7. O vencimento dos 10 minutos
// e o "sem tema" ficam nos testes unitários da espera e do serviço (relógio injetado): aqui não dá para esperar.
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSimulatedProvider, type SimulatedProvider } from "../../src/channels/whatsapp/provider/simulated-provider.js";
import { buildApi, buildWhatsApp, startWorker, type ApiHandle, type WhatsAppHandle, type WorkerHandle } from "../../src/main/compose.js";
import { buildObjectStore } from "../../src/main/media.js";
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
const TEMPORAL = "O Temporal resolveu os workflows longos da cobrança sem duplicar pagamento";
const AUDIO = syntheticOpus({ seconds: 40, script: [{ start: 0, end: 40, text: "o SLA do Pyroscope caiu ontem à noite" }] });

let db: TestDatabase;
let s3: TestObjectStorage;
let config: AppConfig;
let worker: WorkerHandle | undefined;
let whatsapp: WhatsAppHandle;
let api: ApiHandle;
let baseUrl: string;
let provider: SimulatedProvider;
let seq = 0;
const logLines: string[] = [];
const logger = createLogger({ level: "debug", destination: { write: (line: string) => void logLines.push(line) } });

const nextId = () => `DM-${(seq += 1)}`;

/** Manda ao agente e devolve o que ele respondeu (vazio quando ficou calado). */
async function send(message: { id?: string; text?: string; isForwarded?: boolean; quotedId?: string; kind?: "text" | "image" }): Promise<string> {
  provider.clearSent();
  const { kind = "text", id = nextId(), ...rest } = message;
  await provider.deliver({ id, chatJid: MY_CHAT, senderPhone: ME, kind, sentAt: new Date(), ...rest });
  return provider.sent().map((s) => s.text).join("\n");
}

const ask = (text: string) => send({ text });
const forward = (text: string, id = nextId()) => send({ id, text, isForwarded: true });

async function askUntil(text: string, expected: string, timeoutMs = 30_000): Promise<string> {
  const started = Date.now();
  let reply = "";
  while (Date.now() - started < timeoutMs) {
    reply = await ask(text);
    if (reply.includes(expected)) return reply;
    await new Promise((r) => setTimeout(r, 300));
  }
  return reply;
}

async function fakeAgent(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${baseUrl}/v1/channels/fake/agent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ senderAccountId: "fake-operator", ...body }),
  });
  return res.status === 204 ? "" : ((await res.json()) as { text: string }).text;
}

beforeAll(async () => {
  [db, s3] = await Promise.all([startTestDatabase(), startTestObjectStorage()]);
  await seedOperator(db.pool);
  config = loadConfig({
    DATABASE_URL: db.url,
    LOG_LEVEL: "debug",
    PALANTIR_FAKE_CHANNEL: "true",
    PALANTIR_TRANSCRIBER: "fake",
    PALANTIR_MEDIA_KEY: Buffer.alloc(32, 9).toString("base64"),
    S3_ENDPOINT: s3.endpoint,
    S3_BUCKET: s3.bucket,
    S3_ACCESS_KEY: s3.accessKey,
    S3_SECRET_KEY: s3.secretKey,
  });
  worker = await startWorker(config, { metrics, logger });
  await linkVerified({ number: "+55 11 98888-7777", owner: OWNER }, db.pool);
  provider = createSimulatedProvider();
  whatsapp = await buildWhatsApp(config, { provider, metrics, logger });
  api = await buildApi(config, { metrics, logger });
  await api.server.listen({ port: 0, host: "127.0.0.1" });
  baseUrl = `http://127.0.0.1:${(api.server.server.address() as AddressInfo).port}`;
}, 240_000);

afterAll(async () => {
  await api?.close();
  await whatsapp?.close();
  await worker?.close();
  await Promise.all([db?.stop(), s3?.stop()]);
});

describe("S8: guardar com tema e recuperar pelo tema (WhatsApp)", () => {
  it("RF-08, RF-03: o encaminhado espera com um aviso por leva e 'guarda em X' guarda tudo", async () => {
    expect(await forward(TEMPORAL)).toBe('Recebi. Para guardar, mande "guarda em <tema>".');
    expect(await forward("Kafka para eventos de pagamento")).toBe("");
    expect(await ask("guarda em Arquitetura")).toBe("Guardei 2 itens em Arquitetura.");
  });

  it("RF-13: respondendo citando, guarda só a citada; sem citar, o resto", async () => {
    await forward("decidimos usar filas no pg-boss", "FW-A");
    await forward("rascunho sem importância", "FW-B");
    expect(await send({ text: "guarda em decisões", quotedId: "FW-A" })).toBe("Guardei em decisões.");
    expect(await ask("guarda em rascunho")).toBe("Guardei em rascunho.");
    expect(await send({ text: "guarda em decisões", quotedId: "FW-A" })).toContain("Não achei essa mensagem encaminhada");
  });

  it("numa mensagem só e nada para guardar", async () => {
    expect(await ask("guarda em leituras: https://exemplo.com/filas artigo sobre filas")).toBe("Guardei em leituras.");
    expect(await ask("guarda em leituras")).toContain("Não há nada para guardar");
  });

  it("RF-14: o áudio encaminhado é guardado e achado pelo que foi falado", async () => {
    const { text: _t, ...base } = { id: "AU-1", chatJid: MY_CHAT, senderPhone: ME, sentAt: new Date(), isForwarded: true, text: "" };
    provider.clearSent();
    await provider.deliverAudio(base, { bytes: AUDIO, seconds: 40 });
    expect(await ask("guarda em reuniões")).toBe("Guardei em reuniões.");
    expect(await askUntil("o que falaram do Pyroscope?", "Guardados · reuniões")).toContain("Você em Guardados · reuniões");
  });

  it("RF-15: foto sem legenda não é guardada; com legenda, guarda a legenda", async () => {
    await send({ kind: "image", isForwarded: true });
    expect(await ask("guarda em viagens")).toBe("Dessa mensagem eu só guardaria a legenda, e ela não tem.");
    await provider.deliver({ id: nextId(), chatJid: MY_CHAT, senderPhone: ME, kind: "image", caption: "quadro da arquitetura de filas", isForwarded: true, sentAt: new Date() });
    expect(await ask("guarda em viagens")).toBe("Guardei em viagens.");
  });

  it("RF-07: lista o tema com outra grafia; 'mostra a 1' abre o item sem conversa em volta", async () => {
    const listing = await ask("o que guardei sobre arquitetura?");
    expect(listing).toContain("Guardados em Arquitetura (2):");
    expect(listing).toContain("Kafka para eventos de pagamento");
    expect(await ask("guardados ARQUITETURA")).toContain("Guardados em Arquitetura (2):");
    const shown = await ask("mostra a 2");
    expect(shown).toMatch(/\[2\] Guardado em Arquitetura em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}:/);
    expect(shown).toContain(TEMPORAL);
    expect(shown).not.toContain("Conversa em volta");
    expect(await ask("temas")).toMatch(/^Seus temas: .*Arquitetura \(2\)/);
    expect(await ask("guardados finanças")).toContain("Você ainda não guardou nada sobre finanças.");
  });

  it("RN-07: o mesmo conteúdo no mesmo tema não duplica; em outro tema, sim", async () => {
    await forward(TEMPORAL);
    expect(await ask("guarda em arquitetura")).toBe("Isso já estava guardado em Arquitetura.");
    await forward(TEMPORAL);
    expect(await ask("guarda em workflows")).toBe("Guardei em workflows.");
  });

  it("RN-08: o guardado aparece na resposta normal", async () => {
    expect(await askUntil("quem falou do Temporal?", "Guardados")).toContain("Você em Guardados · ");
  });

  it("RF-09: 'esquece a N' com 'confirmo' apaga o item e o arquivo do áudio", async () => {
    await ask("guardados reuniões");
    const { rows } = await db.pool.query<{ storage_key: string }>("SELECT storage_key FROM attachments a JOIN sources s ON s.id = a.source_id WHERE s.kind = 'saved'");
    const key = rows[0]?.storage_key ?? "";
    const store = buildObjectStore(config.media);
    expect(await store.exists(key)).toBe(true);
    expect(await ask("esquece a 1")).toContain('de reuniões? Responda "confirmo".');
    expect(await ask("confirmo")).toBe("Apaguei de reuniões.");
    expect(await ask("guardados reuniões")).toContain("Você ainda não guardou nada sobre reuniões.");
    const started = Date.now();
    while ((await store.exists(key)) && Date.now() - started < 20_000) await new Promise((r) => setTimeout(r, 300));
    expect(await store.exists(key)).toBe(false);
  });

  it("perguntas com a palavra continuam perguntas e a ajuda ensina os comandos", async () => {
    expect(await ask("como guardar senhas no cofre?")).toContain("Não encontrei evidências suficientes.");
    const help = await ask("ajuda");
    expect(help).toContain('"guarda em leituras"');
    expect(help).toContain('"guardados leituras"');
  });

  it("a fonte Guardados aparece por último na lista de grupos", async () => {
    const list = await ask("grupos");
    expect(list.trim().split("\n").at(-1)).toMatch(/Guardados.*seus itens guardados/);
  });

  it("a auditoria registra guardar e esquecer sem tema nem conteúdo", async () => {
    const { rows } = await db.pool.query<{ action: string; details: unknown }>("SELECT action, details FROM audit_events WHERE target_kind = 'knowledge_item'");
    expect(rows.some((r) => r.action === "knowledge.item_saved")).toBe(true);
    expect(rows.some((r) => r.action === "knowledge.item_forgotten")).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/Arquitetura|reuni|Temporal/);
  });
});

describe("S8 pelo canal de teste", () => {
  it("encaminha, guarda e lista pela API", async () => {
    expect(await fakeAgent({ text: "observabilidade com Tempo e Loki", isForwarded: true, messageId: "fake-fw-1" })).toBe('Recebi. Para guardar, mande "guarda em <tema>".');
    expect(await fakeAgent({ text: "guarda em observabilidade", quotedMessageId: "fake-fw-1" })).toBe("Guardei em observabilidade.");
    expect(await fakeAgent({ text: "guardados observabilidade" })).toContain("Guardados em observabilidade (1):");
  });
});

describe("S8: privacidade", () => {
  it("RN-12: nada do conteúdo, dos temas nem do telefone vai para os logs", () => {
    const logs = logLines.join("\n");
    for (const secret of ["Temporal resolveu", "Kafka para eventos", "Arquitetura", "arquitetura", "reuniões", "Pyroscope", "observabilidade", "5511988887777"]) {
      expect(logs).not.toContain(secret);
    }
  });
});
