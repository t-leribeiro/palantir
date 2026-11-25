// Container temporário do Text Embeddings Inference para baixar e medir modelos (feature 007, D-13): um modelo por
// vez, no mesmo volume de modelos do motor local, numa porta própria. Parar o container descarrega o modelo.
import { spawnSync } from "node:child_process";
import { createOpenAiCompatibleEmbedder } from "../../src/modules/knowledge/index.js";
import { parseDockerMemory } from "../transcricao/core.js";

export const TEI_IMAGE = process.env.PALANTIR_EMBEDDER_IMAGE || "ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4";
export const MODELS_VOLUME = "palantir-embedder-models";
export const MEASURE_CONTAINER = "palantir-embedder-medicao";
export const MEASURE_PORT = 8092;
export const MEASURE_URL = `http://127.0.0.1:${MEASURE_PORT}`;

function docker(args: readonly string[]): { ok: boolean; out: string } {
  const r = spawnSync("docker", args, { encoding: "utf8" });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

export function stopMeasureContainer(): void {
  docker(["rm", "-f", MEASURE_CONTAINER]);
}

/** Sobe o modelo e espera o /health (o primeiro uso baixa o modelo para o volume). */
export async function startModel(model: string, timeoutMs = 20 * 60_000): Promise<void> {
  stopMeasureContainer();
  const run = docker([
    "run", "-d", "--name", MEASURE_CONTAINER, "--memory", "6g",
    "-p", `127.0.0.1:${MEASURE_PORT}:80`, "-v", `${MODELS_VOLUME}:/data`,
    // Mesmos limites do motor local (infra/modules/embedder): o padrão de 16384 tokens mata o aquecimento por memória.
    "-e", `MODEL_ID=${model}`, "-e", "MAX_CLIENT_BATCH_SIZE=32", "-e", "MAX_BATCH_TOKENS=2048", "-e", "AUTO_TRUNCATE=true", TEI_IMAGE,
  ]);
  if (!run.ok) throw new Error(`não consegui subir o motor de medição (docker run): ${run.out.split("\n").at(-1) ?? ""}`);
  const deadline = Date.now() + timeoutMs;
  // Os prazos do fetch não seguram o processo: sem isto, o Node encerra no meio da espera.
  const keepAlive = setInterval(() => undefined, 1_000);
  try {
    await waitHealthy(deadline);
  } finally {
    clearInterval(keepAlive);
  }
}

async function waitHealthy(deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    if (!docker(["inspect", "-f", "{{.State.Running}}", MEASURE_CONTAINER]).out.includes("true")) {
      throw new Error("o motor de medição parou: confira o id do modelo no Hugging Face (o log do container mostra o motivo)");
    }
    if (await measureHealth.health()) return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error("o motor de medição não ficou pronto a tempo");
}

export function containerMemory(): number | undefined {
  const stats = docker(["stats", "--no-stream", "--format", "{{.MemUsage}}", MEASURE_CONTAINER]);
  return stats.ok ? parseDockerMemory(stats.out) : undefined;
}

/** Saúde do motor de medição pelo mesmo adaptador do Palantír (a dimensão não importa para o /health). */
const measureHealth = createOpenAiCompatibleEmbedder({ url: MEASURE_URL, model: "medicao", dimensions: 1 });
