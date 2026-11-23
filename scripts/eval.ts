// npm run eval (T054, RF-18): mede acertos, taxa de citação e taxa de "não encontrei" no conjunto
// de avaliação versionado (eval/cases.json). Roda isolado: PostgreSQL próprio em container.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { AgentReply } from "../src/contracts/channel/knowledge-channel.js";
import { buildApi, startWorker } from "../src/main/compose.js";
import { seedOperator } from "../src/main/seed-data.js";
import { loadConfig } from "../src/platform/config.js";
import { createPool, migrate } from "../src/platform/db/index.js";

interface CorpusMessage { id: string; author: string; conversation: string; text: string }
interface EvalCase { id: string; question: string; expectedMessageIds: string[]; expectsNoEvidence: boolean }
interface EvalFile { corpus: CorpusMessage[]; cases: EvalCase[] }

const TARGETS = { accuracy: 0.85, citationRate: 1, noEvidenceRate: 1 };
const data = JSON.parse(readFileSync(new URL("../eval/cases.json", import.meta.url), "utf8")) as EvalFile;
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-");
const noop = () => undefined;

const container = await new PostgreSqlContainer("pgvector/pgvector:0.8.7-pg16").start();
const url = container.getConnectionUri();
await migrate(url);
const pool = createPool(url);
for (const title of new Set(data.corpus.map((m) => m.conversation))) {
  await seedOperator(pool, { conversationId: slug(title), conversationTitle: title });
}

const config = loadConfig({ DATABASE_URL: url, PALANTIR_FAKE_CHANNEL: "true", LOG_LEVEL: "error" });
const metrics = { ingestion: noop, channelInvalid: noop, job: noop, ask: noop };
const api = await buildApi(config, { metrics });
const worker = await startWorker(config, { metrics });

const externalToInternal = new Map<string, string>();
for (const m of data.corpus) {
  const res = await api.server.inject({
    method: "POST",
    url: "/v1/channels/fake/inbound",
    payload: { conversationId: slug(m.conversation), externalMessageId: m.id, senderId: slug(m.author), senderName: m.author, text: m.text, timestamp: "2026-11-20T10:00:00-03:00" },
  });
  externalToInternal.set(m.id, (res.json() as { messageId: string }).messageId);
}
await waitForIndex(data.corpus.length);

const rows: { id: string; question: string; outcome: string; correct: boolean; cited: number }[] = [];
for (const c of data.cases) {
  const res = await api.server.inject({ method: "POST", url: "/v1/channels/fake/agent", payload: { senderAccountId: "fake-operator", text: c.question } });
  const reply = res.json() as AgentReply;
  const cited = reply.citations.map((x) => x.messageId);
  const expected = c.expectedMessageIds.map((id) => externalToInternal.get(id));
  const correct = c.expectsNoEvidence ? reply.outcome === "no_evidence" : reply.outcome === "answered" && expected.every((id) => id && cited.includes(id));
  rows.push({ id: c.id, question: c.question, outcome: reply.outcome, correct, cited: cited.length });
}

const answered = rows.filter((r) => r.outcome === "answered");
const negatives = data.cases.filter((c) => c.expectsNoEvidence).map((c) => rows.find((r) => r.id === c.id));
const result = {
  generatedAt: new Date().toISOString(),
  cases: rows.length,
  accuracy: rows.filter((r) => r.correct).length / rows.length,
  citationRate: answered.length === 0 ? 1 : answered.filter((r) => r.cited > 0).length / answered.length,
  noEvidenceRate: negatives.filter((r) => r?.outcome === "no_evidence").length / Math.max(negatives.length, 1),
  targets: TARGETS,
  failures: rows.filter((r) => !r.correct),
};
mkdirSync(new URL("../reports/", import.meta.url), { recursive: true });
writeFileSync(new URL("../reports/eval.json", import.meta.url), JSON.stringify(result, null, 2));

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
console.log(`Casos: ${result.cases}`);
console.log(`Acertos:            ${pct(result.accuracy)} (meta ≥ ${pct(TARGETS.accuracy)})`);
console.log(`Respostas citadas:  ${pct(result.citationRate)} (meta ${pct(TARGETS.citationRate)})`);
console.log(`"Não encontrei" correto nos casos sem evidência: ${pct(result.noEvidenceRate)}`);
for (const f of result.failures) console.log(`  erro ${f.id}: "${f.question}" → ${f.outcome}`);
console.log("Relatório: reports/eval.json");

await worker.close();
await api.close();
await pool.end();
await container.stop();

async function waitForIndex(expected: number): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const { rows: r } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM message_chunks");
    if ((r[0]?.n ?? 0) >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Indexação do corpus não terminou em 60 s.");
}
