// Métricas e spans da aplicação. Sem SDK iniciado, a API do OpenTelemetry vira no-op.
import { SpanStatusCode, metrics, trace } from "@opentelemetry/api";

/** Métricas da feature 001; implementação trocável para testes. */
export interface AppMetrics {
  ingestion(outcome: string, reason?: string): void;
  channelInvalid(adapter: string): void;
  job(queue: string, status: "completed" | "failed", seconds: number): void;
  ask(outcome: string, seconds: number): void;
}

export function createOtelMetrics(): AppMetrics {
  const meter = metrics.getMeter("palantir");
  const ingestion = meter.createCounter("ingestion_messages_total", { description: "Mensagens recebidas por resultado" });
  const invalid = meter.createCounter("channel_invalid_messages_total", { description: "Mensagens rejeitadas pelo contrato" });
  const jobs = meter.createCounter("jobs_total", { description: "Jobs processados por resultado" });
  const jobDuration = meter.createHistogram("job_duration_seconds", { unit: "s" });
  const askDuration = meter.createHistogram("agent_ask_duration_seconds", { unit: "s" });
  return {
    ingestion: (outcome, reason) => ingestion.add(1, { outcome, reason: reason ?? "" }),
    channelInvalid: (adapter) => invalid.add(1, { adapter }),
    job: (queue, status, seconds) => {
      jobs.add(1, { queue, status });
      jobDuration.record(seconds, { queue });
    },
    ask: (outcome, seconds) => askDuration.record(seconds, { outcome }),
  };
}

const tracer = trace.getTracer("palantir");

/** Executa `work` dentro de um span; erros marcam o span e são repassados. */
export async function withSpan<T>(name: string, work: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      return await work();
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).name });
      throw error;
    } finally {
      span.end();
    }
  });
}

export const seconds = (startedAt: number): number => (performance.now() - startedAt) / 1000;
