// npm run busca:modelos -- <id> [<id>...] (feature 007, D-13; interfaces/cli-medicao-e-config.md §1): baixa modelos
// de embeddings para o volume do motor local, subindo um container temporário por modelo até ele responder.
// Idempotente: um modelo já baixado sobe em segundos.
import { DEFAULT_CANDIDATES } from "./busca/core.js";
import { startModel, stopMeasureContainer } from "./busca/tei.js";

const args = process.argv.slice(2).filter((a) => a.trim() !== "");
const ids = args.length === 0 || args.includes("--candidatos") ? [...DEFAULT_CANDIDATES] : args;
if (process.env.PALANTIR_EMBEDDER_ALLOW_REMOTE === "true") {
  console.error("O download de modelos é só para o motor local (PALANTIR_EMBEDDER_ALLOW_REMOTE=true está ligado).");
  process.exit(2);
}
for (const id of ids) {
  const started = performance.now();
  try {
    await startModel(id);
    console.log(`${id}: pronto (${((performance.now() - started) / 1000).toFixed(0)} s)`);
  } catch (error) {
    console.error(`${id}: ${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    stopMeasureContainer();
  }
}
