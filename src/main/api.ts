// npm run dev:api
import { telemetry } from "./telemetry-bootstrap.js";
import { loadConfig } from "../platform/config.js";
import { buildApi } from "./compose.js";

const config = loadConfig({ ...process.env, PALANTIR_ROLE: "api" });
const api = await buildApi(config);
await api.server.listen({ port: config.httpPort, host: "127.0.0.1" });

async function shutdown() {
  await api.close();
  await telemetry.shutdown();
  process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
