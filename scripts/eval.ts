// npm run eval (T054, RF-18; feature 007, D-12): mede acertos, taxa de citação e taxa de "não encontrei" no conjunto
// de avaliação versionado (eval/cases.json), por tipo de pergunta e por modo de busca. Roda isolado: PostgreSQL
// próprio em container. Os modos `combinada` e `verificador` usam o cálculo de sentido e o verificador do .env.
//   npm run eval                       compara palavra, combinada (e verificador, se configurado)
//   npm run eval -- --modo combinada   roda um modo só
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { AgentReply } from "../src/contracts/channel/knowledge-channel.js";
import { buildApi, startWorker, type ApiHandle } from "../src/main/compose.js";
import { buildEmbedder } from "../src/main/search.js";
import { seedOperator } from "../src/main/seed-data.js";
import { loadConfig, type AppConfig } from "../src/platform/config.js";
import { createPool, migrate } from "../src/platform/db/index.js";
import { MODES, TARGETS, exactRegressions, formatComparison, summarize, type CaseResult, type CaseType, type Mode, type ModeSummary } from "./eval/summary.js";

interface CorpusMessage { id: string; author: string; conversation: string; text: string }
interface EvalCase { id: string; type: CaseType; question: string; expectedMessageIds: string[]; expectsNoEvidence: boolean }
interface EvalFile { corpus: CorpusMessage[]; cases: EvalCase[] }

const { values } = parseArgs({ options: { modo: { type: "string" } } });
const data = JSON.parse(readFileSync(new URL("../eval/cases.json", import.meta.url), "utf8")) as EvalFile;
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-");
const noop = () => undefined;
const metrics = { ingestion: noop, channelInvalid: noop, job: noop, ask: noop };

/** Variáveis da busca vindas do .env; o resto do ambiente (banco, canais) é o do eval. */
const SEARCH_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => /^PALANTIR_(EMBEDDER|VERIFIER|TYPO_)/.test(k) || k === "TYPESAFE_API_KEY" || k === "PALANTIR_SEMANTIC_MIN_SIMILARITY"),
);

const container = await new PostgreSqlContainer("pgvector/pgvector:0.8.7-pg16").start();
const url = container.getConnectionUri();
await migrate(url);
const pool = createPool(url);
for (const title of new Set(data.corpus.map((m) => m.conversation))) {
  await seedOperator(pool, { conversationId: slug(title), conversationTitle: title });
}

const base = { DATABASE_URL: url, PALANTIR_FAKE_CHANNEL: "true", LOG_LEVEL: "error" };
const configs: Record<Mode, AppConfig> = {
  // Linha de base da S5: só a palavra exata, sem palavra parecida nem sentido.
  palavra: loadConfig({ ...base, PALANTIR_EMBEDDER: "off", PALANTIR_VERIFIER: "off", PALANTIR_TYPO_SEARCH: "off" }),
  combinada: loadConfig({ ...base, ...SEARCH_ENV, PALANTIR_VERIFIER: "off" }),
  verificador: loadConfig({ ...base, ...SEARCH_ENV }),
};
const modes = await availableModes();

const worker = await startWorker(modes.includes("combinada") ? configs.combinada : configs.palavra, { metrics });
const ingestApi = await buildApi(configs.palavra, { metrics });
const externalToInternal = new Map<string, string>();
for (const m of data.corpus) {
  const res = await ingestApi.server.inject({
    method: "POST",
    url: "/v1/channels/fake/inbound",
    payload: { conversationId: slug(m.conversation), externalMessageId: m.id, senderId: slug(m.author), senderName: m.author, text: m.text, timestamp: "2026-11-20T10:00:00-03:00" },
  });
  externalToInternal.set(m.id, (res.json() as { messageId: string }).messageId);
}
await ingestApi.close();
await waitFor("SELECT count(*)::int AS n FROM message_chunks", (n) => n >= data.corpus.length, "Indexação do corpus não terminou em 120 s.");
if (modes.includes("combinada")) {
  await waitFor(
    `SELECT count(*)::int AS n FROM message_chunks c WHERE NOT EXISTS (
       SELECT 1 FROM chunk_embeddings e JOIN embedding_models m ON m.id = e.model_id AND m.status = 'active' WHERE e.chunk_id = c.id)`,
    (n) => n === 0,
    "O cálculo de sentido do corpus não terminou em 120 s.",
  );
}

const runs: { mode: Mode; rows: CaseResult[] }[] = [];
for (const mode of modes) runs.push({ mode, rows: await runCases(await buildApi(configs[mode], { metrics })) });
const summaries: ModeSummary[] = runs.map((r) => summarize(r.mode, r.rows));
const palavra = runs.find((r) => r.mode === "palavra");
const regressions = Object.fromEntries(runs.filter((r) => r.mode !== "palavra" && palavra).map((r) => [r.mode, exactRegressions(palavra?.rows ?? [], r.rows)]));

mkdirSync(new URL("../reports/", import.meta.url), { recursive: true });
writeFileSync(new URL("../reports/eval.json", import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), targets: TARGETS, summaries, regressions }, null, 2));

console.log(formatComparison(summaries));
for (const s of summaries) if (s.failures.length > 0) console.log(`  erros em ${s.mode}: ${s.failures.join(", ")}`);
for (const [mode, ids] of Object.entries(regressions)) if (ids.length > 0) console.log(`  regressão de palavra exata em ${mode}: ${ids.join(", ")}`);
console.log("Relatório: reports/eval.json");

await worker.close();
await pool.end();
await container.stop();

/** Os modos pedidos que dá para rodar: sem cálculo de sentido no ar, só `palavra` (com aviso). */
async function availableModes(): Promise<Mode[]> {
  const asked = values.modo ? [values.modo as Mode] : [...MODES];
  if (asked.some((m) => !MODES.includes(m))) throw new Error(`--modo aceita: ${MODES.join(", ")}`);
  const embedder = buildEmbedder(configs.combinada.search.embedder);
  const semanticUp = embedder ? await embedder.health() : false;
  if (!semanticUp && asked.some((m) => m !== "palavra")) {
    console.warn("Cálculo de sentido desligado ou fora do ar (PALANTIR_EMBEDDER no .env, npm run setup): rodando só o modo palavra.");
  }
  const verifierOn = configs.verificador.search.verifier.engine !== "off";
  return asked.filter((m) => m === "palavra" || (semanticUp && (m === "combinada" || verifierOn)));
}

async function runCases(api: ApiHandle): Promise<CaseResult[]> {
  const rows: CaseResult[] = [];
  for (const c of data.cases) {
    const res = await api.server.inject({ method: "POST", url: "/v1/channels/fake/agent", payload: { senderAccountId: "fake-operator", text: c.question } });
    const reply = res.json() as AgentReply;
    const cited = reply.citations.map((x) => x.messageId);
    const expected = c.expectedMessageIds.map((id) => externalToInternal.get(id));
    const correct = c.expectsNoEvidence ? reply.outcome === "no_evidence" : reply.outcome === "answered" && expected.every((id) => id && cited.includes(id));
    rows.push({ id: c.id, type: c.type, outcome: reply.outcome, correct, cited: cited.length });
  }
  await api.close();
  return rows;
}

async function waitFor(sql: string, done: (n: number) => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const { rows: r } = await pool.query<{ n: number }>(sql);
    if (done(r[0]?.n ?? -1)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(message);
}
