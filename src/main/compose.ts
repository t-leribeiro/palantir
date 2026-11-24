// Raiz de composição (ADR-0001): o único lugar que liga portas às implementações.
import type { FastifyInstance } from "fastify";
import { createFakeChannel, fakeChannelRoutes } from "../channels/fake/index.js";
import type { CapturePorts } from "../channels/whatsapp/capture.js";
import { createOtelWhatsAppObserver, type ObserverLog } from "../channels/whatsapp/observability.js";
import type { WhatsAppProvider } from "../channels/whatsapp/provider/provider.js";
import {
  createWhatsAppChannel,
  type InboundReceiptsPort,
  type WhatsAppChannel,
  type WhatsAppObserver,
} from "../channels/whatsapp/whatsapp-channel.js";
import type { InboundHandler, IngestOutcome } from "../contracts/channel/knowledge-channel.js";
import { createAskQuestion, createDeterministicAnswerGenerator, createPgInboundReceipts, type UnknownSenderPolicy } from "../modules/agent/index.js";
import { createPgIdentityRepository, createResolveUserByChannelAccount } from "../modules/identity/index.js";
import { INDEX_QUEUE, createIngestMessage, createPgUnitOfWork } from "../modules/ingestion/index.js";
import { createIndexMessage, createPgChunkRepository, type IndexRequest } from "../modules/knowledge/index.js";
import { createOtelMediaObserver } from "../modules/media/index.js";
import { createPgSearchIndex, createSearchEvidence } from "../modules/retrieval/index.js";
import {
  createIsSourceAuthorized,
  createPgCaptureRepository,
  createPgGroupDirectory,
  createPgSourceRepository,
  createRouteGroup,
  createSyncGroupDirectory,
} from "../modules/sources/index.js";
import type { AppConfig, CaptureMode } from "../platform/config.js";
import { checkDatabase, createPool, type Pool } from "../platform/db/index.js";
import { buildHttpServer, type HealthStatus } from "../platform/http/server.js";
import { createLogger, type Logger } from "../platform/logging/logger.js";
import { createJobQueue, type JobQueue, type QueueDefinition } from "../platform/queue/index.js";
import { createOtelMetrics, seconds, withSpan, type AppMetrics } from "../platform/telemetry/index.js";
import { newId } from "../shared/index.js";
import { MEDIA_JOBS, MEDIA_QUEUE_DEFINITION, captureMediaKinds, startMediaWorker, withMediaPreparation } from "./media.js";

export const QUEUES: readonly QueueDefinition[] = [
  { name: INDEX_QUEUE, retryLimit: 5, retryDelaySeconds: 2, expireInSeconds: 60, deadLetter: `${INDEX_QUEUE}.dead` },
  MEDIA_QUEUE_DEFINITION,
];

export interface CompositionOptions {
  readonly logger?: Logger;
  readonly metrics?: AppMetrics;
  /** Ganchos do worker de mídia (feature 005): observador de métricas e saúde do motor. */
  readonly media?: Parameters<typeof startMediaWorker>[4];
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

/** Agente com identidade, busca e resposta determinística (ADR-0007); a política vem do canal. */
function buildAsk(config: AppConfig, pool: Pool, unknownSender: UnknownSenderPolicy) {
  const search = createSearchEvidence({ index: createPgSearchIndex(pool), lowConfidenceThreshold: config.lowConfidenceThreshold });
  return createAskQuestion({
    identity: { resolve: createResolveUserByChannelAccount(createPgIdentityRepository(pool)) },
    search: { search: (request) => withSpan("retrieval.search", () => search(request)) },
    generator: createDeterministicAnswerGenerator(),
    unknownSender,
  });
}

export async function buildApi(config: AppConfig, options: CompositionOptions = {}): Promise<ApiHandle> {
  const { pool, queue, logger, metrics } = await infra(config, options);
  const ingest = buildIngest(pool, queue);
  const ask = buildAsk(config, pool, "reply");

  const channel = createFakeChannel({ onInvalid: () => metrics.channelInvalid("fake") });
  channel.onMessage((message) => withSpan("ingestion.ingest", () => ingest(message).then(record(metrics, logger))));
  channel.onAgentMessage((message) =>
    withSpan("agent.ask", async () => {
      const started = performance.now();
      const reply = await ask(message);
      metrics.ask(reply?.outcome ?? "silent", seconds(started));
      logger.info({ outcome: reply?.outcome ?? "silent", citations: reply?.citations.length ?? 0 }, "pergunta respondida");
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

/** Ingestão completa (autorização, deduplicação, gravação e job na mesma transação). */
export function buildIngest(pool: Pool, queue: JobQueue) {
  return createIngestMessage({
    sources: { check: createIsSourceAuthorized(createPgSourceRepository(pool)) },
    unitOfWork: createPgUnitOfWork(pool, queue, MEDIA_JOBS),
    ids: newId,
  });
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
  const media = await startMediaWorker(config, pool, queue, logger, options.media ?? { observer: createOtelMediaObserver() });
  logger.info({ queue: INDEX_QUEUE }, "worker pronto");
  return {
    async close() {
      media.stop();
      await queue.stop();
      await pool.end();
    },
  };
}

export interface WhatsAppHandle {
  readonly channel: WhatsAppChannel;
  /** Canal só de captura, no modo de dois números (feature 004, D-02). */
  readonly captureChannel: WhatsAppChannel | undefined;
  readonly server: FastifyInstance;
  close(): Promise<void>;
}

export interface WhatsAppCompositionOptions extends CompositionOptions {
  /** Provedor do número do agente; no modo `agent`, também captura. */
  readonly provider: WhatsAppProvider;
  /** Provedor do número de captura, obrigatório no modo `dedicated`. */
  readonly captureProvider?: WhatsAppProvider;
  readonly observer?: WhatsAppObserver;
  readonly captureObserver?: WhatsAppObserver;
}

const RECEIPT_RETENTION_MS = 7 * 24 * 3600 * 1000;
const DEDICATED_WITHOUT_PROVIDER = "PALANTIR_WHATSAPP_CAPTURE=dedicated exige o provedor do número de captura.";

/** Portas de captura sobre o módulo `sources` (D-05, D-07): rota por mensagem, sem cache. */
function buildCapturePorts(pool: Pool): CapturePorts {
  const directory = createPgGroupDirectory(pool);
  const route = createRouteGroup(createPgCaptureRepository(pool));
  return {
    route,
    syncGroups: createSyncGroupDirectory(directory),
    knownGroups: async () => (await directory.list()).filter((g) => !g.leftAt),
  };
}

/** Estado da captura no health (interfaces/health-whatsapp.md): `off`, a sessão do agente ou a de captura. */
function captureState(mode: CaptureMode, agent: WhatsAppChannel, capture: WhatsAppChannel | undefined): HealthStatus {
  if (mode === "off") return "off";
  return (capture ?? agent).state();
}

interface CaptureWiring {
  readonly ports: CapturePorts | undefined;
  readonly queue: JobQueue | undefined;
  /** Entrada da captura para um canal: com mídia, prepara os anexos pelo `fetchMedia` dele (feature 005). */
  readonly ingestFor: ((channel: WhatsAppChannel) => InboundHandler) | undefined;
  readonly mediaKinds: readonly "audio"[];
}

async function wireCapture(config: AppConfig, pool: Pool, metrics: AppMetrics, logger: Logger): Promise<CaptureWiring> {
  if (config.whatsapp.capture === "off") return { ports: undefined, queue: undefined, ingestFor: undefined, mediaKinds: [] };
  const queue = createJobQueue(config.databaseUrl, QUEUES);
  await queue.start();
  const ingest = buildIngest(pool, queue);
  const recorded: InboundHandler = (message) => withSpan("ingestion.ingest", () => ingest(message).then(record(metrics, logger)));
  const prepare = await withMediaPreparation(config, pool, logger, createOtelMediaObserver());
  return {
    ports: buildCapturePorts(pool),
    queue,
    ingestFor: (channel) => (prepare ? prepare(recorded, channel) : recorded),
    mediaKinds: prepare ? captureMediaKinds(config.media) : [],
  };
}

function buildCaptureChannel(options: WhatsAppCompositionOptions, wiring: CaptureWiring, receipts: InboundReceiptsPort, log: ObserverLog): WhatsAppChannel {
  if (!options.captureProvider || !wiring.ports || !wiring.ingestFor) throw new Error(DEDICATED_WITHOUT_PROVIDER);
  const channel = createWhatsAppChannel({
    provider: options.captureProvider,
    receipts,
    observer: options.captureObserver ?? createOtelWhatsAppObserver(undefined, log, "capture"),
    roles: { answer: false, capture: true },
    capturePorts: wiring.ports,
    captureMediaKinds: wiring.mediaKinds,
  });
  channel.onMessage(wiring.ingestFor(channel));
  return channel;
}

/** Número do agente: responde sempre; no modo `agent`, também captura (D-02). */
function buildAgentChannel(options: WhatsAppCompositionOptions, mode: CaptureMode, wiring: CaptureWiring, receipts: InboundReceiptsPort, log: ObserverLog): WhatsAppChannel {
  const captures = mode === "agent" && wiring.ports !== undefined;
  const channel = createWhatsAppChannel({
    provider: options.provider,
    receipts,
    observer: options.observer ?? createOtelWhatsAppObserver(undefined, log, "agent"),
    roles: { answer: true, capture: captures },
    ...(captures ? { capturePorts: wiring.ports, captureMediaKinds: wiring.mediaKinds } : {}),
  });
  if (captures && wiring.ingestFor) channel.onMessage(wiring.ingestFor(channel));
  return channel;
}

/** Pergunta ao agente com trace, métrica e log sem conteúdo (só resultado e quantidade de citações). */
function answerWith(ask: ReturnType<typeof buildAsk>, metrics: AppMetrics, logger: Logger) {
  return (message: Parameters<ReturnType<typeof buildAsk>>[0]) =>
    withSpan("agent.ask", async () => {
      const started = performance.now();
      const reply = await ask(message);
      metrics.ask(reply?.outcome ?? "silent", seconds(started));
      logger.info({ outcome: reply?.outcome ?? "silent", citations: reply?.citations.length ?? 0 }, "mensagem ao agente pelo WhatsApp tratada");
      return reply;
    });
}

/**
 * Processo do WhatsApp (feature 003, D-04; feature 004, D-01, D-02, D-14). O número do agente responde;
 * com a captura em `agent` ele também captura grupos autorizados; em `dedicated`, um segundo número só
 * captura. Remetente desconhecido não recebe nada (política "silent"); health com o estado das sessões.
 */
export async function buildWhatsApp(config: AppConfig, options: WhatsAppCompositionOptions): Promise<WhatsAppHandle> {
  // Antes de abrir banco e fila: configuração incompleta não pode deixar conexões abertas.
  if (config.whatsapp.capture === "dedicated" && !options.captureProvider) throw new Error(DEDICATED_WITHOUT_PROVIDER);
  const pool = createPool(config.databaseUrl);
  const logger = options.logger ?? createLogger({ level: config.logLevel, exportToOtel: Boolean(config.otlpEndpoint) });
  const metrics = options.metrics ?? createOtelMetrics();
  const receipts = createPgInboundReceipts(pool);
  const purged = await receipts.purgeOlderThan(new Date(Date.now() - RECEIPT_RETENTION_MS));
  const ask = buildAsk(config, pool, "silent");
  const log = { info: (m: string) => logger.info(m), warn: (m: string) => logger.warn(m), error: (m: string) => logger.error(m) };
  const mode = config.whatsapp.capture;
  const wiring = await wireCapture(config, pool, metrics, logger);
  const channel = buildAgentChannel(options, mode, wiring, receipts, log);
  const captureChannel = mode === "dedicated" ? buildCaptureChannel(options, wiring, receipts, log) : undefined;
  channel.onAgentMessage(answerWith(ask, metrics, logger));
  const server = await buildHttpServer({
    logger,
    health: async () => ({ db: await checkDatabase(pool), whatsapp: channel.state(), capture: captureState(mode, channel, captureChannel) }),
  });
  await channel.connect();
  await captureChannel?.connect();
  logger.info({ purgedReceipts: purged, capture: mode }, "canal WhatsApp iniciado");
  return {
    channel,
    captureChannel,
    server,
    async close() {
      await channel.disconnect();
      await captureChannel?.disconnect();
      await server.close();
      await wiring.queue?.stop();
      await pool.end();
    },
  };
}
