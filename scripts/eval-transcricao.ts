// npm run eval:transcricao -- <preparar|fleurs|medir> (feature 005, RF-11, D-19,
// interfaces/cli-importacao-e-medicao.md). Tudo fica em exports/medicao/ (fora do git). A saída nunca
// mostra texto transcrito nem de referência, nem nome de arquivo original: só números e nomes gerados (NN).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { openExportArchive } from "../src/channels/whatsapp-export/index.js";
import {
  InvalidOggError,
  aggregateWer,
  createOpenAiCompatibleTranscriber,
  mediaKindOfFileName,
  oggOpusDuration,
  werCount,
  type WerCount,
} from "../src/modules/media/index.js";
import { loadConfig } from "../src/platform/config.js";
import {
  formatTable,
  parseDockerMemory,
  parseFleursTsv,
  pickAudios,
  pickFleurs,
  type AudioCandidate,
  type MeasureResult,
} from "./transcricao/core.js";
import { extractFromTarGz } from "./transcricao/tar.js";

const ROOT = new URL("../exports/medicao/", import.meta.url);
const REAL_DIR = new URL("real/", ROOT);
const FLEURS_DIR = new URL("fleurs/", ROOT);
const FLEURS_BASE = "https://huggingface.co/datasets/google/fleurs/resolve/main/data/pt_br";
const FLEURS_FILES = { tsv: { name: "test.tsv", size: 563_257 }, audio: { name: "test.tar.gz", size: 621_291_324 } };
const CONTAINER = "palantir-transcriber";

const README = `Transcrição de referência (feature 005). Estes arquivos ficam só nesta máquina: são áudios de terceiros.

Para cada NN.opus, escreva no NN.txt o que você ouvir, palavra por palavra:
- não corrija a fala nem o português de quem fala;
- ignore hesitações ("é...", "hum", "ahn");
- escreva os números como foram falados ("dois mil e vinte" ou "2020", tanto faz, mas seja coerente);
- marque com [?] o trecho que não entender: ele fica fora da conta.

Depois rode: npm run eval:transcricao -- medir --modelos <id1>,<id2>,...
`;

const path = (url: URL) => decodeURIComponent(url.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const nn = (i: number) => String(i + 1).padStart(2, "0");

async function preparar(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { quantos: { type: "string", default: "20" }, semente: { type: "string", default: "1" } } });
  const file = positionals[0];
  if (!file) throw new Error("uso: npm run eval:transcricao -- preparar <export.zip> [--quantos 20] [--semente 1]");
  const dir = path(REAL_DIR);
  mkdirSync(dir, { recursive: true });
  const filled = readdirSync(dir).filter((f) => f.endsWith(".txt") && readFileSync(join(dir, f), "utf8").trim() !== "");
  if (filled.length > 0) throw new Error(`Já há ${filled.length} transcrições preenchidas em exports/medicao/real/: nada foi sobrescrito.`);
  const archive = await openExportArchive(file);
  try {
    const candidates = await audioCandidates(archive);
    const picked = pickAudios(candidates, Number(values.quantos), Number(values.semente));
    let total = 0;
    for (const [i, audio] of picked.entries()) {
      writeFileSync(join(dir, `${nn(i)}.opus`), await archive.read(audio.name));
      writeFileSync(join(dir, `${nn(i)}.txt`), "");
      total += audio.seconds;
    }
    writeFileSync(join(dir, "LEIA-ME.txt"), README);
    console.log(`Preparados ${picked.length} áudios (total ${Math.round(total / 60)} min). Transcreva cada NN.txt e rode "medir".`);
  } finally {
    archive.close();
  }
}

async function audioCandidates(archive: Awaited<ReturnType<typeof openExportArchive>>): Promise<AudioCandidate[]> {
  const out: AudioCandidate[] = [];
  for (const name of archive.names()) {
    if (mediaKindOfFileName(name) !== "audio") continue;
    try {
      out.push({ name, seconds: oggOpusDuration(await archive.read(name)) });
    } catch (error) {
      if (!(error instanceof InvalidOggError)) throw error;
    }
  }
  return out;
}

async function download(url: string, target: string, size: number): Promise<void> {
  const have = existsSync(target) ? statSync(target).size : 0;
  if (have === size) return;
  const response = await fetch(url, { headers: have > 0 && have < size ? { range: `bytes=${have}-` } : {} });
  if (!response.ok || !response.body) throw new Error(`Download do FLEURS falhou (HTTP ${response.status}).`);
  const append = response.status === 206;
  const out = createWriteStream(target, { flags: append ? "a" : "w" });
  for await (const chunk of response.body) out.write(chunk);
  await new Promise<void>((r) => out.end(r));
  if (statSync(target).size !== size) throw new Error("Download do FLEURS incompleto: rode de novo para continuar.");
}

async function fleurs(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { quantos: { type: "string", default: "50" }, semente: { type: "string", default: "1" } } });
  const dir = path(FLEURS_DIR);
  mkdirSync(dir, { recursive: true });
  for (const f of Object.values(FLEURS_FILES)) await download(`${FLEURS_BASE}/${f.name === "test.tsv" ? f.name : `audio/${f.name}`}`, join(dir, f.name), f.size);
  const rows = pickFleurs(parseFleursTsv(readFileSync(join(dir, FLEURS_FILES.tsv.name), "utf8")), Number(values.quantos), Number(values.semente));
  const extracted = new Set(await extractFromTarGz(join(dir, FLEURS_FILES.audio.name), new Set(rows.map((r) => r.fileName)), join(dir, "audio")));
  const kept = rows.filter((r) => extracted.has(r.fileName));
  for (const [i, row] of kept.entries()) {
    writeFileSync(join(dir, `${nn(i)}.wav`), readFileSync(join(dir, "audio", row.fileName)));
    writeFileSync(join(dir, `${nn(i)}.txt`), row.raw);
  }
  console.log(`Amostra do FLEURS pronta: ${kept.length} frases (CC BY 4.0).`);
}

interface Pair {
  readonly audio: string;
  readonly reference: string;
}

function pairsIn(dir: string): { pairs: Pair[]; empty: number } {
  if (!existsSync(dir)) return { pairs: [], empty: 0 };
  const audios = readdirSync(dir).filter((f) => /^\d\d\.(opus|wav)$/.test(f)).sort();
  const pairs: Pair[] = [];
  let empty = 0;
  for (const audio of audios) {
    const txt = join(dir, audio.replace(/\.(opus|wav)$/, ".txt"));
    const reference = existsSync(txt) ? readFileSync(txt, "utf8").trim() : "";
    if (reference === "") empty += 1;
    else pairs.push({ audio: join(dir, audio), reference });
  }
  return { pairs, empty };
}

function sampleMemory(): number | undefined {
  const r = spawnSync("docker", ["stats", "--no-stream", "--format", "{{.MemUsage}}", CONTAINER], { encoding: "utf8" });
  return r.status === 0 ? parseDockerMemory(r.stdout) : undefined;
}

/** Progresso numa linha só (contagem, nunca texto): no terminal, reescreve a linha; fora dele, cala. */
function progress(line: string, done = false): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\r${line.padEnd(80)}${done ? "\r" : ""}`);
}

const mimeOf = (file: string) => (file.endsWith(".wav") ? "audio/wav" : "audio/ogg");
const IDLE_POLL_MS = 15_000;
const IDLE_MAX_MS = 15 * 60_000;

/** Espera o motor local descarregar os modelos (GET /api/ps do Speaches). Motor sem essa rota: segue. */
async function waitEngineIdle(url: string): Promise<void> {
  const deadline = Date.now() + IDLE_MAX_MS;
  let announced = false;
  while (Date.now() < deadline) {
    const loaded = await loadedModels(url);
    if (loaded === undefined || loaded === 0) return;
    if (!announced) console.log("Esperando o motor descarregar o modelo anterior (alguns minutos)...");
    announced = true;
    await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
  }
  throw new Error("O motor não descarregou o modelo anterior em 15 min e pode estar travado. Reinicie com: docker restart palantir-transcriber");
}

async function loadedModels(url: string): Promise<number | undefined> {
  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/api/ps`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { models?: unknown };
    return Array.isArray(body.models) ? body.models.length : undefined;
  } catch {
    return undefined;
  }
}

async function measure(model: string, set: MeasureResult["set"], pairs: readonly Pair[], url: string): Promise<MeasureResult> {
  const transcriber = createOpenAiCompatibleTranscriber({ url, model, minTimeoutMs: 600_000 });
  const counts: WerCount[] = [];
  let audioSeconds = 0;
  let elapsed = 0;
  let peak: number | undefined;
  const timer = setInterval(() => {
    const now = sampleMemory();
    if (now !== undefined) peak = Math.max(peak ?? 0, now);
  }, 2000);
  try {
    // Aquecimento fora do cronômetro: a carga do modelo não entra no tempo real.
    const first = pairs[0];
    if (first) await transcriber.transcribe({ audio: readFileSync(first.audio), mimeType: mimeOf(first.audio), language: "pt" });
    for (const pair of pairs) {
      const started = performance.now();
      const result = await transcriber.transcribe({ audio: readFileSync(pair.audio), mimeType: mimeOf(pair.audio), language: "pt" });
      elapsed += (performance.now() - started) / 1000;
      audioSeconds += result.durationSeconds ?? 0;
      counts.push(werCount(pair.reference, result.text));
      progress(`${model} · ${set}: ${counts.length}/${pairs.length}`);
    }
  } finally {
    clearInterval(timer);
    progress("", true);
  }
  return { model, set, audios: pairs.length, seconds: audioSeconds, wer: aggregateWer(counts), rtf: audioSeconds > 0 ? elapsed / audioSeconds : 0, peakMemoryBytes: peak };
}

async function medir(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { modelos: { type: "string" }, conjuntos: { type: "string", default: "real,fleurs" } } });
  if (!values.modelos) throw new Error("uso: npm run eval:transcricao -- medir --modelos <id>[,<id>...] [--conjuntos real,fleurs]");
  const url = loadConfig({ ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "postgres://-" }).media.transcription.url;
  const sets = values.conjuntos.split(",").map((s) => s.trim()) as MeasureResult["set"][];
  const dirs: Record<MeasureResult["set"], string> = { real: path(REAL_DIR), fleurs: path(FLEURS_DIR) };
  const results: MeasureResult[] = [];
  const bySet: { set: MeasureResult["set"]; pairs: Pair[] }[] = [];
  for (const set of sets) {
    const { pairs, empty } = pairsIn(dirs[set]);
    if (empty > 0) console.log(`Conjunto ${set}: ${empty} áudio(s) sem transcrição de referência ficaram de fora.`);
    if (pairs.length > 0) bySet.push({ set, pairs });
  }
  // Um modelo por vez: o motor mantém o anterior carregado por alguns minutos e, juntos, eles passam do
  // limite de memória do container e caem na swap, o que distorce tempo e memória (medição de 2026-11-24).
  for (const model of values.modelos.split(",").map((m) => m.trim())) {
    await waitEngineIdle(url);
    console.log(`Medindo ${model} (o primeiro áudio de cada conjunto aquece o modelo, fora do cronômetro)...`);
    for (const { set, pairs } of bySet) results.push(await measure(model, set, pairs, url));
  }
  if (results.length === 0) throw new Error("Nenhum par áudio + transcrição encontrado. Rode preparar e/ou fleurs antes.");
  console.log(formatTable(results));
  const out = join(path(ROOT), `resultado-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  console.log("Resultado (só números) gravado em exports/medicao/.");
}

const [command, ...rest] = process.argv.slice(2);
const commands: Record<string, (args: string[]) => Promise<void>> = { preparar, fleurs, medir };
const run = command ? commands[command] : undefined;
if (!run) {
  console.error("uso: npm run eval:transcricao -- <preparar|fleurs|medir> ...");
  process.exit(2);
}
run(rest).catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
