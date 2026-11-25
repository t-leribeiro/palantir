// T021 (feature 006): gestão de grupos pelo WhatsApp simulado (RF-11), com PostgreSQL real e o modo de um número
// (PALANTIR_WHATSAPP_CAPTURE=agent). Verificar a conta com o código do terminal, listar, acompanhar, perguntar
// citando o grupo, parar, apagar com aviso, comando escrito no grupo sem efeito e remetente desconhecido em silêncio.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSimulatedProvider, type SimulatedProvider } from "../../src/channels/whatsapp/provider/simulated-provider.js";
import type { IncomingGroupMessage } from "../../src/channels/whatsapp/provider/provider.js";
import { buildWhatsApp, startWorker, type WhatsAppHandle, type WorkerHandle } from "../../src/main/compose.js";
import { seedOperator } from "../../src/main/seed-data.js";
import { parseGroupsArgs, runGroups } from "../../src/main/whatsapp-groups.js";
import { runLink } from "../../src/main/whatsapp-link.js";
import { loadConfig } from "../../src/platform/config.js";
import { createLogger } from "../../src/platform/logging/logger.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";

const noop = () => undefined;
const metrics = { ingestion: noop, channelInvalid: noop, job: noop, ask: noop };
const OWNER = { provider: "fake", accountId: "fake-operator" };
const ME = "+5511988887777";
const MY_CHAT = "5511988887777@s.whatsapp.net";
const STRANGER_CHAT = "5511911112222@s.whatsapp.net";
const ANA = "+5511977776666";
const ALFA = "120363000000000301@g.us";
const BETA = "120363000000000302@g.us";

let db: TestDatabase;
let worker: WorkerHandle;
let whatsapp: WhatsAppHandle;
let provider: SimulatedProvider;
let code = "";
let seq = 0;
const logLines: string[] = [];
const logger = createLogger({ level: "debug", destination: { write: (line: string) => void logLines.push(line) } });

const groupMessage = (groupId: string, text: string): IncomingGroupMessage => ({
  id: `GRP-${(seq += 1)}`,
  groupId,
  senderPhone: ANA,
  senderName: "Ana Souza",
  kind: "text",
  text,
  sentAt: new Date(),
});

async function say(text: string, chatJid = MY_CHAT, senderPhone = ME): Promise<string> {
  provider.clearSent();
  await provider.deliver({ id: `DM-${(seq += 1)}`, chatJid, senderPhone, kind: "text", text, sentAt: new Date() });
  return provider.sent().map((s) => s.text).join("\n");
}

async function until(read: () => Promise<string>, expected: string, timeoutMs = 15_000): Promise<string> {
  const started = Date.now();
  let value = await read();
  while (!value.includes(expected) && Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 250));
    value = await read();
  }
  return value;
}

const count = async (like: string) =>
  (await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM messages WHERE text ILIKE $1", [`%${like}%`])).rows[0]?.n ?? 0;

beforeAll(async () => {
  db = await startTestDatabase();
  await seedOperator(db.pool);
  const config = loadConfig({ DATABASE_URL: db.url, LOG_LEVEL: "error", PALANTIR_WHATSAPP_CAPTURE: "agent" });
  worker = await startWorker(config, { metrics });
  code = (await runLink({ number: "+55 11 98888-7777", owner: OWNER }, db.pool)).code ?? "";
  provider = createSimulatedProvider();
  whatsapp = await buildWhatsApp(config, { provider, metrics, logger });
  provider.setGroups([
    { groupId: ALFA, subject: "Projeto Alfa", participants: 5 },
    { groupId: BETA, subject: "Projeto Beta", participants: 3 },
  ]);
}, 240_000);

afterAll(async () => {
  await whatsapp?.close();
  await worker?.close();
  await db?.stop();
});

describe("S5: gestão de grupos pelo WhatsApp", () => {
  it("RN-02: a conta vinculada fica pendente até mandar o código do terminal", async () => {
    expect(code).toMatch(/^\d{6}$/);
    expect(await say("grupos")).toContain("Sua conta ainda não foi verificada");
    expect(await say(`${code.slice(0, 3)} ${code.slice(3)}`)).toBe("Conta verificada. Pode perguntar e gerenciar seus grupos por aqui.");
  });

  it("RF-02: lista os grupos do número do agente", async () => {
    const list = await until(() => say("grupos"), "Projeto Beta · não acompanhado");
    expect(list).toContain("Projeto Alfa · não acompanhado");
  });

  it("RF-03 e RF-14: acompanhar com confirmação; a pergunta que cita o grupo busca só nele", async () => {
    expect(await say("acompanhar projeto alfa")).toContain('Para acompanhar "Projeto Alfa"');
    expect(await say("confirmo")).toContain('"Projeto Alfa" está sendo acompanhado');
    await provider.deliverGroup(groupMessage(ALFA, "os girassóis do Alfa floresceram"));
    const reply = await until(() => say("no Projeto Alfa, quem falou de girassóis?"), "Ana Souza");
    expect(reply).toContain("Ana Souza em Projeto Alfa");
  });

  it("comando escrito dentro do grupo é mensagem do grupo, não ordem", async () => {
    await provider.deliverGroup(groupMessage(ALFA, "apagar Projeto Alfa"));
    await until(async () => String(await count("apagar Projeto Alfa")), "1");
    expect(await count("girassóis do Alfa")).toBe(1);
    expect(provider.sent().some((s) => s.chatJid.endsWith("@g.us"))).toBe(false);
  });

  it("RF-04: parar tem efeito na próxima mensagem do grupo", async () => {
    expect(await say("parar Projeto Alfa")).toContain('Parei de acompanhar "Projeto Alfa"');
    await provider.deliverGroup(groupMessage(ALFA, "mensagem depois de parar"));
    expect(await count("depois de parar")).toBe(0);
  });

  it("RF-05: apagar com confirmação, some na hora e o aviso chega pela conversa direta", async () => {
    expect(await say("apagar Projeto Alfa")).toContain('"confirmo apagar Projeto Alfa"');
    expect(await say("confirmo apagar Projeto Alfa")).toBe('Apagando "Projeto Alfa". Aviso aqui quando terminar.');
    const notice = await until(async () => provider.sent().map((s) => `${s.chatJid} ${s.text}`).join("\n"), "Terminei de apagar");
    expect(notice).toContain(`${MY_CHAT} Terminei de apagar "Projeto Alfa": 2 mensagens e 0 áudios.`);
    expect(await count("girassóis do Alfa")).toBe(0);
    expect(await say("quem falou de girassóis?")).toContain("Não encontrei evidências suficientes.");
  });

  it("RF-13: apagar pelo terminal exige o nome e avisa a conta verificada do dono", async () => {
    await runGroups(parseGroupsArgs(["autorizar", "2", "--consentimento", "todos avisados e de acordo"]), db.pool);
    await provider.deliverGroup(groupMessage(BETA, "mensagem do Beta"));
    await until(async () => String(await count("mensagem do Beta")), "1");
    await expect(runGroups(parseGroupsArgs(["apagar", "2", "--nome", "Projeto Alfa"]), db.pool, db.url)).rejects.toThrow('nome exato: "Projeto Beta"');
    provider.clearSent();
    expect(await runGroups(parseGroupsArgs(["apagar", "2", "--nome", "projeto beta"]), db.pool, db.url)).toEqual({ action: "apagar", title: "Projeto Beta", outcome: "requested" });
    const notice = await until(async () => provider.sent().map((s) => s.text).join("\n"), "Terminei de apagar");
    expect(notice).toContain('Terminei de apagar "Projeto Beta": 1 mensagem e 0 áudios.');
  });

  it("remetente desconhecido continua sem resposta; logs sem nomes de grupo nem telefones", async () => {
    expect(await say("grupos", STRANGER_CHAT, "+5511911112222")).toBe("");
    const logs = logLines.join("\n");
    for (const secret of ["Projeto Alfa", "Projeto Beta", "988887777", "977776666", code]) expect(logs).not.toContain(secret);
  });
});
