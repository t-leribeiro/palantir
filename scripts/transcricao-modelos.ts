// npm run transcricao:modelos -- <id> [<id>...] (feature 005, interfaces/transcriber.md §5): pede ao motor
// local que baixe os modelos (POST /v1/models/{id}, confirmado no spike da T001). Idempotente.
import { loadConfig } from "../src/platform/config.js";

const ids = process.argv.slice(2).filter((a) => a.trim() !== "");
if (ids.length === 0) {
  console.error("uso: npm run transcricao:modelos -- <id> [<id>...]   ex.: Systran/faster-whisper-small");
  process.exit(2);
}
const { url, allowRemote } = loadConfig({ ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "postgres://-" }).media.transcription;
if (allowRemote) {
  console.error("O download de modelos é só para o motor local (PALANTIR_TRANSCRIBER_ALLOW_REMOTE=true está ligado).");
  process.exit(2);
}
for (const id of ids) {
  const started = performance.now();
  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/v1/models/${id}`, { method: "POST" });
    await response.body?.cancel();
    const seconds = ((performance.now() - started) / 1000).toFixed(0);
    console.log(response.ok ? `${id}: pronto (${seconds} s)` : `${id}: o motor recusou (HTTP ${response.status}); confira o id no registro do Speaches`);
    if (!response.ok) process.exitCode = 1;
  } catch {
    console.error(`${id}: o motor de transcrição não respondeu em ${url}. Rode npm run setup.`);
    process.exitCode = 1;
  }
}
