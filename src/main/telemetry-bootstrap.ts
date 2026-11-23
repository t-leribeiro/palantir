// Importado primeiro pelos entrypoints: a telemetria precisa iniciar antes de pg, fastify e pino.
import { basename } from "node:path";
import { startTelemetry } from "../platform/telemetry/index.js";

// O papel vem do entrypoint (api.ts, worker.ts ou whatsapp.ts): imports ESM rodam antes de qualquer código do arquivo.
const entry = basename(process.argv[1] ?? "api");
const role = ["worker", "whatsapp"].find((name) => entry.startsWith(name)) ?? "api";

export const telemetry = startTelemetry({
  serviceName: `${process.env.PALANTIR_SERVICE_NAME ?? "palantir"}-${role}`,
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
});
