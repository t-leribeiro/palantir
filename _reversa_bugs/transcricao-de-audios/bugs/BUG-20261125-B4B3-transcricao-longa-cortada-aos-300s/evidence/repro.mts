// Reprodução do BUG-20261125-B4B3: o motor só responde depois de 320 s; o prazo do adaptador é 1.200 s (3× 400 s).
import http from "node:http";
import { createOpenAiCompatibleTranscriber } from "file:///C:/projects/soultech/palantir/src/modules/media/infrastructure/transcribers/openai-compatible.ts";
const delay = Number(process.argv[2] ?? 320) * 1000;
const body = JSON.stringify({ language: "portuguese", duration: 400, text: "ok", segments: [{ start: 0, end: 1, text: "ok" }] });
const server = http.createServer((req, res) => { req.resume(); setTimeout(() => res.writeHead(200, { "content-type": "application/json" }).end(body), delay); });
server.listen(0, "127.0.0.1", async () => {
  const { port } = server.address() as { port: number };
  const t = createOpenAiCompatibleTranscriber({ url: `http://127.0.0.1:${port}`, model: "m" });
  const t0 = Date.now();
  try {
    const r = await t.transcribe({ audio: new Uint8Array([1, 2, 3]), mimeType: "audio/ogg", durationHint: 400 });
    console.log(`ok em ${Math.round((Date.now() - t0) / 1000)} s; segmentos=${r.segments.length}`);
  } catch (e) {
    const err = e as { kind?: string; name?: string; cause?: { code?: string } };
    console.log(`falhou em ${Math.round((Date.now() - t0) / 1000)} s; kind=${err.kind} name=${err.name}`);
  }
  server.close(); process.exit(0);
});
