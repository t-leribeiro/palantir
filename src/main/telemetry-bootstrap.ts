// Importado primeiro pelos entrypoints: a telemetria precisa iniciar antes de pg, fastify e pino.
import { basename } from "node:path";
import { startTelemetry } from "../platform/telemetry/index.js";

// O papel vem do entrypoint (api.ts ou worker.ts): imports ESM rodam antes de qualquer código do arquivo.
const role = basename(process.argv[1] ?? "api").startsWith("worker") ? "worker" : "api";

export const telemetry = startTelemetry({
  serviceName: `${process.env.PALANTIR_SERVICE_NAME ?? "palantir"}-${role}`,
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
});
