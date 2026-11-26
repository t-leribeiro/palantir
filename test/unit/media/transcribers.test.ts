// T008 (feature 005, RF-07, D-08 a D-10): porta Transcriber, adaptador compatível com OpenAI e motor falso.
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TranscriberError } from "../../../src/modules/media/application/ports.js";
import { createFakeTranscriber } from "../../../src/modules/media/infrastructure/transcribers/fake.js";
import { createOpenAiCompatibleTranscriber } from "../../../src/modules/media/infrastructure/transcribers/openai-compatible.js";
import { saying, syntheticOpus } from "../../support/audio.js";
import { one } from "../../support/rows.js";

interface Captured {
  url: string;
  method: string;
  auth: string | undefined;
  body: string;
}

let server: Server;
let base: string;
let reply: { status: number; body: unknown; delayMs?: number };
let captured: Captured[] = [];

async function read(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("latin1");
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    captured.push({ url: req.url ?? "", method: req.method ?? "", auth: req.headers.authorization, body: await read(req) });
    if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs));
    res.writeHead(reply.status, { "content-type": "application/json" });
    res.end(JSON.stringify(reply.body));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

beforeEach(() => {
  captured = [];
  reply = { status: 200, body: {} };
});

// Formato observado no spike da T001 (Speaches 0.8.3, actions.md, Notas de execução).
const SPEACHES_OK = {
  task: "transcribe",
  language: "pt",
  duration: 16.1,
  text: " Bom dia pessoal! Hoje eu quero falar sobre o temporal.",
  segments: [
    { id: 0, start: 0, end: 9.54, text: " Bom dia pessoal!", avg_logprob: -0.2 },
    { id: 1, start: 9.54, end: 16, text: " Hoje eu quero falar sobre o temporal." },
  ],
};

const audio = new Uint8Array([1, 2, 3, 4]);

/** Troca o fetch global por um que sempre falha: prova que o adaptador fala com o motor pelo próprio transporte. */
async function withoutGlobalFetch<T>(work: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => Promise.reject(new TypeError("fetch global usado"))) as typeof fetch;
  try {
    return await work();
  } finally {
    globalThis.fetch = original;
  }
}

const transcriber = (extra: Partial<Parameters<typeof createOpenAiCompatibleTranscriber>[0]> = {}) =>
  createOpenAiCompatibleTranscriber({ url: `${base}/`, model: "Systran/faster-whisper-small", ...extra });

describe("adaptador openai-compatible", () => {
  it("manda multipart com nome fixo, modelo, pt, verbose_json e segmentos; mapeia a resposta do Speaches", async () => {
    reply = { status: 200, body: SPEACHES_OK };
    const result = await transcriber().transcribe({ audio, mimeType: "audio/ogg; codecs=opus", durationHint: 16 });
    expect(result).toEqual({
      engine: "openai-compatible",
      model: "Systran/faster-whisper-small",
      modelVersion: "unknown",
      language: "pt",
      durationSeconds: 16.1,
      text: "Bom dia pessoal! Hoje eu quero falar sobre o temporal.",
      segments: [
        { start: 0, end: 9.54, text: "Bom dia pessoal!" },
        { start: 9.54, end: 16, text: "Hoje eu quero falar sobre o temporal." },
      ],
    });
    const sent = one(captured);
    expect(sent).toMatchObject({ url: "/v1/audio/transcriptions", method: "POST", auth: undefined });
    expect(sent.body).toContain('filename="audio.ogg"');
    expect(sent.body).toContain("Systran/faster-whisper-small");
    expect(sent.body).toMatch(/name="language"\r\n\r\npt\r\n/);
    expect(sent.body).toMatch(/name="response_format"\r\n\r\nverbose_json/);
    expect(sent.body).toMatch(/name="timestamp_granularities\[\]"\r\n\r\nsegment/);
  });

  it("manda a chave da API só quando configurada (motor remoto, RN-03)", async () => {
    reply = { status: 200, body: SPEACHES_OK };
    await transcriber({ apiKey: "sk-teste" }).transcribe({ audio, mimeType: "audio/ogg" });
    expect(one(captured).auth).toBe("Bearer sk-teste");
  });

  it("idioma por extenso vira código; desconhecido vira und; sem segmentos é transcrição vazia", async () => {
    reply = { status: 200, body: { language: "portuguese", text: "  ", segments: [] } };
    const empty = await transcriber().transcribe({ audio, mimeType: "audio/ogg" });
    expect(empty).toMatchObject({ language: "pt", text: "", segments: [], durationSeconds: null });
    reply = { status: 200, body: { language: "klingon", text: "x", segments: [{ start: 0, end: 1, text: "x" }] } };
    expect((await transcriber().transcribe({ audio, mimeType: "audio/ogg" })).language).toBe("und");
  });

  it("segmento sem tempo é erro do motor; segmento só com espaços é descartado", async () => {
    reply = { status: 200, body: { text: "a", segments: [{ text: "a" }] } };
    await expect(transcriber().transcribe({ audio, mimeType: "audio/ogg" })).rejects.toMatchObject({ kind: "engine_failed" });
    reply = { status: 200, body: { text: "a", segments: [{ start: 0, end: 1, text: " " }, { start: 1, end: 2, text: "a" }] } };
    expect((await transcriber().transcribe({ audio, mimeType: "audio/ogg" })).segments).toEqual([{ start: 1, end: 2, text: "a" }]);
  });

  it.each([
    [415, "corrupted"],
    [400, "corrupted"],
    [404, "engine_failed"],
    [500, "engine_failed"],
  ] as const)("HTTP %i vira %s", async (status, kind) => {
    reply = { status, body: { detail: "x" } };
    const error = await transcriber().transcribe({ audio, mimeType: "audio/ogg" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TranscriberError);
    expect((error as TranscriberError).kind).toBe(kind);
    if (status === 404) expect((error as Error).message).toContain("npm run transcricao:modelos");
  });

  it("prazo estourado vira timeout; motor fora do ar vira unavailable", async () => {
    reply = { status: 200, body: SPEACHES_OK, delayMs: 300 };
    await expect(transcriber({ minTimeoutMs: 50 }).transcribe({ audio, mimeType: "audio/ogg" })).rejects.toMatchObject({ kind: "timeout" });
    const down = createOpenAiCompatibleTranscriber({ url: "http://127.0.0.1:9", model: "m" });
    await expect(down.transcribe({ audio, mimeType: "audio/ogg" })).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("BUG-20261125-B4B3: não depende do fetch global do Node, que corta a resposta do motor aos 300 s", async () => {
    reply = { status: 200, body: SPEACHES_OK };
    const result = await withoutGlobalFetch(() => transcriber({ apiKey: "sk-teste" }).transcribe({ audio, mimeType: "audio/ogg", durationHint: 16 }));
    expect(result.segments).toHaveLength(2);
    expect(one(captured)).toMatchObject({ url: "/v1/audio/transcriptions", method: "POST", auth: "Bearer sk-teste" });
    expect(one(captured).body).toMatch(/name="response_format"\r\n\r\nverbose_json/);
  });

  it("BUG-20261125-B4B3: sem o fetch global, o prazo do adaptador continua virando timeout e o motor fora do ar, unavailable", async () => {
    reply = { status: 200, body: SPEACHES_OK, delayMs: 300 };
    await expect(withoutGlobalFetch(() => transcriber({ minTimeoutMs: 50 }).transcribe({ audio, mimeType: "audio/ogg" }))).rejects.toMatchObject({ kind: "timeout" });
    const down = createOpenAiCompatibleTranscriber({ url: "http://127.0.0.1:9", model: "m" });
    await expect(withoutGlobalFetch(() => down.transcribe({ audio, mimeType: "audio/ogg" }))).rejects.toMatchObject({ kind: "unavailable" });
    reply = { status: 200, body: "OK" };
    expect(await withoutGlobalFetch(() => transcriber().health())).toBe(true);
  });

  it.each([236.06, 361.1, 40.05])("BUG-20261125-JOMJ: duração decimal (%s s) não quebra o prazo; a chamada chega ao motor", async (durationHint) => {
    reply = { status: 200, body: SPEACHES_OK };
    const result = await transcriber().transcribe({ audio, mimeType: "audio/ogg", durationHint });
    expect(result.segments).toHaveLength(2);
    expect(one(captured).url).toBe("/v1/audio/transcriptions");
  });

  it("health: 200 é saudável; erro ou fora do ar não", async () => {
    reply = { status: 200, body: "OK" };
    expect(await transcriber().health()).toBe(true);
    expect(one(captured).url).toBe("/health");
    reply = { status: 503, body: {} };
    expect(await transcriber().health()).toBe(false);
    expect(await createOpenAiCompatibleTranscriber({ url: "http://127.0.0.1:9", model: "m" }).health()).toBe(false);
  });
});

describe("motor falso", () => {
  it("devolve o roteiro do áudio sintético, com a duração do Ogg", async () => {
    const text = 'vamos falar do "Temporal" [ok]';
    const result = await createFakeTranscriber().transcribe({ audio: syntheticOpus(saying(text, 12)), mimeType: "audio/ogg" });
    expect(result).toMatchObject({ engine: "fake", language: "pt", durationSeconds: 12, segments: [{ start: 0, end: 12, text }] });
  });

  it("áudio sem roteiro dá transcrição vazia; bytes que não são Ogg são corrompidos", async () => {
    expect((await createFakeTranscriber().transcribe({ audio: syntheticOpus({ seconds: 3 }), mimeType: "audio/ogg" })).segments).toEqual([]);
    await expect(createFakeTranscriber().transcribe({ audio: new Uint8Array(50), mimeType: "audio/ogg" })).rejects.toMatchObject({ kind: "corrupted" });
  });

  it("falhas transitórias configuráveis antes de responder", async () => {
    const t = createFakeTranscriber({ failTimes: 1 });
    await expect(t.transcribe({ audio: syntheticOpus({ seconds: 1 }), mimeType: "audio/ogg" })).rejects.toMatchObject({ kind: "engine_failed" });
    await expect(t.transcribe({ audio: syntheticOpus({ seconds: 1 }), mimeType: "audio/ogg" })).resolves.toMatchObject({ engine: "fake" });
    expect(await t.health()).toBe(true);
  });
});
