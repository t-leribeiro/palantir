// npm run eval:busca -- <preparar|medir> [--modelos a,b] [--conversa T3] (feature 007, RF-08, D-13;
// interfaces/cli-medicao-e-config.md §2 e §3). As perguntas reais ficam em exports/medicao/busca/ (fora do git): são
// sobre conversas de terceiros. A saída nunca mostra pergunta, trecho, nome de pessoa nem texto de mensagem: só
// números, nomes de modelo e o número da pergunta.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createPool } from "../src/platform/db/index.js";
import { DEFAULT_CANDIDATES, formatTable, metricsOf, prefixesFor, rankMessages, scoreQuestion, type Candidate, type ModelRow } from "./busca/core.js";
import { MEASURE_URL, containerMemory, probeDimensions, startModel, stopMeasureContainer } from "./busca/tei.js";

const ROOT = new URL("../exports/medicao/busca/", import.meta.url);
const QUESTIONS = new URL("perguntas.json", ROOT);
const RESULT = new URL("resultado.json", ROOT);

interface RealQuestion { pergunta: string; trechos: string[]; tipo?: string }
interface RealFile { conversa: string; perguntas: RealQuestion[] }
interface SyntheticFile {
  corpus: { id: string; text: string }[];
  cases: { id: string; type: string; question: string; expectedMessageIds: string[] }[];
}
interface Question { readonly n: number; readonly text: string; readonly expected: readonly string[] }
interface Corpus { readonly chunks: readonly { messageId: string; text: string }[]; readonly questions: readonly Question[] }

const LEIAME = `Perguntas reais para medir a busca pelo sentido (feature 007). Este arquivo fica só nesta máquina: as
conversas são de terceiros. Para cada pergunta:
- escreva como você perguntaria ao agente, com palavras DIFERENTES das usadas no grupo;
- em "trechos", copie um pedaço literal da mensagem certa (basta um pedaço que só ela tenha);
- "trechos": [] marca uma pergunta sobre assunto que NÃO está na conversa (inclua 4 ou 5).
Depois rode: npm run eval:busca -- medir
`;

const TEMPLATE: RealFile = {
  conversa: "T3",
  perguntas: [
    { pergunta: "quem sugeriu algo para baratear a nuvem?", trechos: ["reduziu em 30% o custo"], tipo: "parafrase" },
    { pergunta: "alguém falou de computação quântica?", trechos: [], tipo: "sem_evidencia" },
  ],
};

const { positionals, values } = parseArgs({ allowPositionals: true, options: { modelos: { type: "string" }, conversa: { type: "string" } } });
const command = positionals[0];

if (command === "preparar") prepare();
else if (command === "medir") await measure();
else {
  console.error("uso: npm run eval:busca -- <preparar|medir> [--modelos a,b] [--conversa T3]");
  process.exit(2);
}

function prepare(): void {
  mkdirSync(ROOT, { recursive: true });
  writeFileSync(new URL("LEIAME.txt", ROOT), LEIAME);
  if (existsSync(QUESTIONS)) console.log("perguntas.json já existe: nada foi sobrescrito.");
  else writeFileSync(QUESTIONS, `${JSON.stringify(TEMPLATE, null, 2)}\n`);
  console.log("Preencha exports/medicao/busca/perguntas.json (veja LEIAME.txt) e rode npm run eval:busca -- medir");
}

async function realCorpus(): Promise<Corpus | undefined> {
  if (!existsSync(QUESTIONS)) {
    console.warn("Sem perguntas reais (rode npm run eval:busca -- preparar): medindo só o conjunto sintético.");
    return undefined;
  }
  const file = JSON.parse(readFileSync(QUESTIONS, "utf8")) as RealFile;
  const title = values.conversa ?? file.conversa;
  const pool = createPool(process.env.DATABASE_URL ?? "");
  try {
    const { rows } = await pool.query<{ message_id: string; text: string }>(
      `SELECT c.message_id, c.text FROM message_chunks c JOIN messages m ON m.id = c.message_id JOIN sources s ON s.id = m.source_id
        WHERE s.title = $1 AND s.status <> 'deleting'`,
      [title],
    );
    const questions = file.perguntas.map((q, i) => ({ n: i + 1, text: q.pergunta, expected: resolve(rows, q.trechos, i + 1) }));
    return { chunks: rows.map((r) => ({ messageId: r.message_id, text: r.text })), questions };
  } finally {
    await pool.end();
  }
}

/** Ids das mensagens com o trecho literal; avisa (pelo número) quando o trecho não casa ou casa com várias. */
function resolve(rows: readonly { message_id: string; text: string }[], trechos: readonly string[], n: number): string[] {
  const ids = new Set<string>();
  for (const trecho of trechos) {
    const matches = new Set(rows.filter((r) => r.text.toLowerCase().includes(trecho.toLowerCase())).map((r) => r.message_id));
    if (matches.size !== 1) console.warn(`pergunta ${n}: um trecho casou com ${matches.size} mensagens`);
    for (const id of matches) ids.add(id);
  }
  return [...ids];
}

function syntheticCorpus(): Corpus {
  const data = JSON.parse(readFileSync(new URL("../eval/cases.json", import.meta.url), "utf8")) as SyntheticFile;
  return {
    chunks: data.corpus.map((m) => ({ messageId: m.id, text: m.text })),
    questions: data.cases.map((c, i) => ({ n: i + 1, text: c.question, expected: c.expectedMessageIds })),
  };
}

async function embedAll(texts: readonly string[], prefix: string): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 32) {
    const response = await fetch(`${MEASURE_URL}/v1/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: texts.slice(i, i + 32).map((t) => `${prefix}${t}`), model: "medicao" }),
    });
    if (!response.ok) throw new Error(`o motor de medição recusou um lote (HTTP ${response.status})`);
    const json = (await response.json()) as { data: { index: number; embedding: number[] }[] };
    for (const d of [...json.data].sort((a, b) => a.index - b.index)) {
      const norm = Math.hypot(...d.embedding) || 1;
      out.push(d.embedding.map((x) => x / norm));
    }
  }
  return out;
}

async function measureSet(set: "real" | "sintetico", model: string, corpus: Corpus, dims: number): Promise<ModelRow> {
  const prefixes = prefixesFor(model);
  const started = performance.now();
  const vectors = await embedAll(corpus.chunks.map((c) => c.text), prefixes.document);
  const seconds = (performance.now() - started) / 1000;
  const candidates: Candidate[] = corpus.chunks.map((c, i) => ({ messageId: c.messageId, vector: vectors[i] ?? [] }));
  const queries = await embedAll(corpus.questions.map((q) => q.text), prefixes.query);
  const scores = corpus.questions.map((q, i) => scoreQuestion(rankMessages(queries[i] ?? [], candidates), q.expected));
  return { set, model, dimensions: dims, metrics: metricsOf(scores), messagesPerSecond: corpus.chunks.length / Math.max(seconds, 0.001), memoryBytes: containerMemory() };
}

async function measure(): Promise<void> {
  const models = values.modelos ? values.modelos.split(",").map((m) => m.trim()).filter(Boolean) : [...DEFAULT_CANDIDATES];
  const real = await realCorpus();
  const synthetic = syntheticCorpus();
  const rows: ModelRow[] = [];
  for (const model of models) {
    process.stdout.write(`${model}: carregando... `);
    try {
      await startModel(model);
      const dims = await probeDimensions();
      if (real) rows.push(await measureSet("real", model, real, dims));
      rows.push(await measureSet("sintetico", model, synthetic, dims));
      console.log("medido");
    } catch (error) {
      console.log(`falhou: ${(error as Error).message}`);
    } finally {
      stopMeasureContainer();
    }
  }
  mkdirSync(ROOT, { recursive: true });
  writeFileSync(RESULT, `${JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)}\n`);
  console.log(`\n${formatTable(rows)}`);
  console.log("\nR@k: mensagem certa entre as k primeiras, só pelo sentido. τ: menor limiar com ≥ 90% das perguntas sem evidência sem resposta.");
  console.log("Pos≥τ: perguntas com evidência que passam nesse limiar. Escolha no .env: PALANTIR_EMBEDDER_MODEL, _DIMENSIONS, _QUERY_PREFIX, _DOCUMENT_PREFIX e PALANTIR_SEMANTIC_MIN_SIMILARITY (o τ).");
  console.log("Resultado: exports/medicao/busca/resultado.json");
}
