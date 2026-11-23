// Logs JSON estruturados sem conteúdo de mensagens (privacidade, RF-17). Só identificadores.
// Cada linha leva trace_id/span_id do span ativo e, com `exportToOtel`, também segue para o OTLP (Loki).
import { Writable } from "node:stream";
import { SeverityNumber, logs, trace } from "@opentelemetry/api";
import { pino, type DestinationStream, type Logger } from "pino";

/** Campos que podem carregar conteúdo de conversa ou segredos e nunca vão para o log. */
export const REDACTED_PATHS = [
  "text",
  "*.text",
  "*.*.text",
  "chunkText",
  "*.chunkText",
  "query",
  "*.query",
  "body",
  "req.body",
  "res.body",
  "reply.text",
  "password",
  "*.password",
  "databaseUrl",
  "*.databaseUrl",
  "req.headers.authorization",
  "req.headers.cookie",
];

export interface LoggerOptions {
  readonly level?: string;
  readonly service?: string;
  readonly destination?: DestinationStream;
  /** Encaminha cada linha também para o pipeline de logs do OpenTelemetry. */
  readonly exportToOtel?: boolean;
}

const SEVERITY: Record<string, SeverityNumber> = {
  trace: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
};

export function createLogger(options: LoggerOptions = {}): Logger {
  const destination = options.destination ?? pino.destination(1);
  const stream = options.exportToOtel ? pino.multistream([{ stream: destination }, { stream: otelStream() }]) : destination;
  return pino(
    {
      level: options.level ?? "info",
      base: { service: options.service ?? "palantir" },
      redact: { paths: REDACTED_PATHS, censor: "[redacted]" },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      mixin: traceContext,
    },
    stream,
  );
}

function traceContext(): Record<string, string> {
  const ctx = trace.getActiveSpan()?.spanContext();
  return ctx ? { trace_id: ctx.traceId, span_id: ctx.spanId } : {};
}

/** Recebe as linhas já redigidas pelo pino e as emite como LogRecord do OpenTelemetry. */
function otelStream(): Writable {
  const otel = logs.getLogger("palantir");
  return new Writable({
    write(chunk: Buffer, _encoding, done) {
      try {
        const { msg, level, time: _time, ...attributes } = JSON.parse(chunk.toString()) as Record<string, unknown>;
        const label = String(level ?? "info");
        otel.emit({
          body: String(msg ?? ""),
          severityText: label,
          severityNumber: SEVERITY[label] ?? SeverityNumber.INFO,
          attributes: flatten(attributes),
        });
      } catch {
        // linha não-JSON: ignorada no export, continua no stdout
      }
      done();
    },
  });
}

function flatten(record: Record<string, unknown>, prefix = ""): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(record)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object") Object.assign(out, flatten(value as Record<string, unknown>, name));
    else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[name] = value;
  }
  return out;
}

export type { Logger };
