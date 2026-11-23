// Raiz de composição (ADR-0001): o único lugar que liga portas às implementações.
import type { FastifyInstance } from "fastify";
import { createFakeChannel, fakeChannelRoutes } from "../channels/fake/index.js";
import type { IngestOutcome } from "../contracts/channel/knowledge-channel.js";
import { createAskQuestion, createDeterministicAnswerGenerator } from "../modules/agent/index.js";
import { createPgIdentityRepository, createResolveUserByChannelAccount } from "../modules/identity/index.js";
import { INDEX_QUEUE, createIngestMessage, createPgUnitOfWork } from "../modules/ingestion/index.js";
import { createIndexMessage, createPgChunkRepository, type IndexRequest } from "../modules/knowledge/index.js";
import { createPgSearchIndex, createSearchEvidence } from "../modules/retrieval/index.js";
import { createIsSourceAuthorized, createPgSourceRepository } from "../modules/sources/index.js";
import type { AppConfig } from "../platform/config.js";
import { checkDatabase, createPool, type Pool } from "../platform/db/index.js";
import { buildHttpServer } from "../platform/http/server.js";
import { createLogger, type Logger } from "../platform/logging/logger.js";
import { createJobQueue, type JobQueue, type QueueDefinition } from "../platform/queue/index.js";
import { createOtelMetrics, seconds, withSpan, type AppMetrics } from "../platform/telemetry/index.js";
import { newId } from "../shared/index.js";

export const QUEUES: readonly QueueDefinition[] = [
  { name: INDEX_QUEUE, retryLimit: 5, retryDelaySeconds: 2, expireInSeconds: 60, deadLetter: `${INDEX_QUEUE}.dead` },
];

export interface CompositionOptions {
  readonly logger?: Logger;
  readonly metrics?: AppMetrics;
}

interface Infra {
  readonly pool: Pool;
  readonly queue: JobQueue;
  readonly logger: Logger;
  readonly metrics: AppMetrics;
}

async function infra(config: AppConfig, options: CompositionOptions): Promise<Infra> {
  const pool = createPool(config.databaseUrl);
  const queue = createJobQueue(config.databaseUrl, QUEUES);
  await queue.start();
  return {
    pool,
    queue,
    logger: options.logger ?? createLogger({ level: config.logLevel, exportToOtel: Boolean(config.otlpEndpoint) }),
    metrics: options.metrics ?? createOtelMetrics(),
  };
}

export interface ApiHandle {
  readonly server: FastifyInstance;
  close(): Promise<void>;
}

export async function buildApi(config: AppConfig, options: CompositionOptions = {}): Promise<ApiHandle> {
  const { pool, queue, logger, metrics } = await infra(config, options);
  const ingest = createIngestMessage({
    sources: { check: createIsSourceAuthorized(createPgSourceRepository(pool)) },
    unitOfWork: createPgUnitOfWork(pool, queue),
    ids: newId,
  });
  const search = createSearchEvidence({ index: createPgSearchIndex(pool), lowConfidenceThreshold: config.lowConfidenceThreshold });
  const ask = createAskQuestion({
    identity: { resolve: createResolveUserByChannelAccount(createPgIdentityRepository(pool)) },
    search: { search: (request) => withSpan("retrieval.search", () => search(request)) },
    generator: createDeterministicAnswerGenerator(),
  });

  const channel = createFakeChannel({ onInvalid: () => metrics.channelInvalid("fake") });
  channel.onMessage((message) => withSpan("ingestion.ingest", () => ingest(message).then(record(metrics, logger))));
  channel.onAgentMessage((message) =>
    withSpan("agent.ask", async () => {
      const started = performance.now();
      const reply = await ask(message);
      metrics.ask(reply.outcome, seconds(started));
      logger.info({ outcome: reply.outcome, citations: reply.citations.length }, "pergunta respondida");
      return reply;
    }),
  );
  await channel.connect();

  const server = await buildHttpServer({
    logger,
    health: async () => ({ db: await checkDatabase(pool), queue: await queue.check() }),
    routes: config.fakeChannelEnabled ? [fakeChannelRoutes(channel)] : [],
  });
  return {
    server,
    async close() {
      await server.close();
      await channel.disconnect();
      await queue.stop();
      await pool.end();
    },
  };
}

function record(metrics: AppMetrics, logger: Logger) {
  return (outcome: IngestOutcome): IngestOutcome => {
    const reason = outcome.outcome === "rejected" ? outcome.reason : undefined;
    metrics.ingestion(outcome.outcome, reason);
    if (outcome.outcome === "rejected") logger.warn({ reason }, "mensagem rejeitada na ingestão");
    else logger.info({ messageId: outcome.messageId, outcome: outcome.outcome }, "mensagem ingerida");
    return outcome;
  };
}

export interface WorkerHandle {
  close(): Promise<void>;
}

export async function startWorker(config: AppConfig, options: CompositionOptions = {}): Promise<WorkerHandle> {
  const { pool, queue, logger, metrics } = await infra(config, options);
  const index = createIndexMessage(createPgChunkRepository(pool));
  await queue.work<IndexRequest>(INDEX_QUEUE, (job) =>
    withSpan("knowledge.index", async () => {
      const started = performance.now();
      try {
        const outcome = await index(job);
        metrics.job(INDEX_QUEUE, "completed", seconds(started));
        logger.info({ messageId: job.messageId, outcome }, "mensagem indexada");
      } catch (error) {
        metrics.job(INDEX_QUEUE, "failed", seconds(started));
        logger.error({ messageId: job.messageId, err: { name: (error as Error).name } }, "falha ao indexar");
        throw error;
      }
    }),
  );
  logger.info({ queue: INDEX_QUEUE }, "worker pronto");
  return {
    async close() {
      await queue.stop();
      await pool.end();
    },
  };
}
