// npm run dev:worker
import { telemetry } from "./telemetry-bootstrap.js";
import { loadConfig } from "../platform/config.js";
import { startWorker } from "./compose.js";

const config = loadConfig({ ...process.env, PALANTIR_ROLE: "worker" });
const worker = await startWorker(config);

async function shutdown() {
  await worker.close();
  await telemetry.shutdown();
  process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
