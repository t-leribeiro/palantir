// OpenTelemetry (RF-17, D-19): traces, métricas e logs via OTLP para o Collector local.
// Precisa iniciar antes de carregar pg, fastify e pino para instrumentá-los.
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

export interface TelemetryHandle {
  shutdown(): Promise<void>;
}

const noop: TelemetryHandle = { shutdown: async () => undefined };

export function startTelemetry(options: { serviceName: string; otlpEndpoint: string | undefined }): TelemetryHandle {
  if (!options.otlpEndpoint) return noop;
  const base = options.otlpEndpoint.replace(/\/$/, "");
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: options.serviceName, [ATTR_SERVICE_VERSION]: "0.1.0" }),
    traceExporter: new OTLPTraceExporter({ url: `${base}/v1/traces` }),
    metricReaders: [
      new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics` }), exportIntervalMillis: 10_000 }),
    ],
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${base}/v1/logs` }) })],
    instrumentations: [
      new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => req.url === "/health" }),
      // Só a forma da query vai para o span, nunca os valores (conteúdo das mensagens). requireParentSpan
      // descarta as consultas de polling do pg-boss que não pertencem a uma requisição ou job.
      new PgInstrumentation({ enhancedDatabaseReporting: false, requireParentSpan: true }),
    ],
  });
  sdk.start();
  return { shutdown: () => sdk.shutdown() };
}
