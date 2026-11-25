// Composição da gestão de fontes pelo agente (feature 006): filas da exclusão e do aviso, verificação de conta,
// comandos de gestão, filtro por grupo na pergunta, execução da exclusão no worker e aviso no canal.
import {
  AGENT_NOTIFY_QUEUE,
  createManageSources,
  parseCommand,
  createPgConversationState,
  type AccountGate,
  type CatalogEntry,
  type ManageSources,
  type SourceManagementPort,
} from "../modules/agent/index.js";
import {
  createPgIdentityRepository,
  createPgVerificationRepository,
  createResolveAccount,
  createVerifyAccountCode,
  type VerifyOutcome,
} from "../modules/identity/index.js";
import { createMediaPurger } from "../modules/media/index.js";
import {
  SOURCE_DELETE_QUEUE,
  createCaptureAdmin,
  createExecuteSourceDeletion,
  createPgAuditLog,
  createPgCaptureRepository,
  createPgDeletionStore,
  createPgGroupDirectory,
  createPgImportSourceRepository,
  createPgSpaceSourceRepository,
  createRequestSourceDeletion,
  createSourceManagement,
  completedDeletion,
  createOtelManagementObserver,
  deletionsInProgress,
  noticeQueueFor,
  type AuditLog,
  type ManagementObserver,
  type MediaPurger,
  type SourceDeleteJob,
} from "../modules/sources/index.js";
import type { AppConfig } from "../platform/config.js";
import type { Pool } from "../platform/db/index.js";
import type { Logger } from "../platform/logging/logger.js";
import type { JobQueue, QueueDefinition } from "../platform/queue/index.js";
import { withSpan } from "../platform/telemetry/index.js";
import { buildObjectStore } from "./media.js";

/** 12 tentativas com recuo exponencial a partir de 30 s: cerca de 34 h antes da fila morta (D-08, EC-03). */
export const SOURCE_DELETE_QUEUE_DEFINITION: QueueDefinition = {
  name: SOURCE_DELETE_QUEUE,
  retryLimit: 12,
  retryDelaySeconds: 30,
  expireInSeconds: 900,
  deadLetter: `${SOURCE_DELETE_QUEUE}.dead`,
};

/** Canais que recebem o aviso de exclusão concluída, cada um na sua fila (D-10). */
export const NOTICE_PROVIDERS = ["whatsapp", "fake"] as const;

export const AGENT_NOTIFY_QUEUE_DEFINITIONS: readonly QueueDefinition[] = NOTICE_PROVIDERS.map((provider) => ({
  name: noticeQueueFor(AGENT_NOTIFY_QUEUE, provider),
  retryLimit: 5,
  retryDelaySeconds: 10,
  expireInSeconds: 120,
}));

let sharedObserver: ManagementObserver | undefined;

/** Um observador por processo: os medidores do OpenTelemetry são registrados uma vez só. */
export function managementObserver(): ManagementObserver {
  sharedObserver ??= createOtelManagementObserver();
  return sharedObserver;
}

export interface AgentManagement {
  readonly accounts: AccountGate;
  readonly manage: ManageSources;
  readonly catalog: (spaceId: string) => Promise<readonly CatalogEntry[]>;
}

/** Conferência do código com auditoria de verificação e de bloqueio (RN-07). */
function auditedVerify(pool: Pool, audit: AuditLog): AccountGate["verify"] {
  const verify = createVerifyAccountCode(createPgVerificationRepository(pool));
  return async (accountId, code): Promise<VerifyOutcome> => {
    const outcome = await verify(accountId, code);
    if (outcome.kind !== "verified" && outcome.kind !== "locked") return outcome;
    const { rows } = await pool.query<{ user_id: string }>("SELECT user_id FROM channel_accounts WHERE id = $1", [accountId]);
    const action = outcome.kind === "verified" ? "account.verified" : "account.verification_locked";
    await audit.record({ actorUserId: rows[0]?.user_id ?? null, action, targetKind: "channel_account", targetId: accountId });
    return outcome;
  };
}

/** Agente com verificação de conta, comandos de gestão e catálogo de nomes (feature 006). */
export function buildAgentManagement(pool: Pool, queue: JobQueue, observer: ManagementObserver = managementObserver()): AgentManagement {
  const directory = createPgGroupDirectory(pool);
  const captures = createPgCaptureRepository(pool);
  const admin = createCaptureAdmin({ directory, captures, sources: createPgImportSourceRepository(pool) });
  const audit = createPgAuditLog(pool);
  const sources = createSourceManagement({ directory, captures, admin, spaceSources: createPgSpaceSourceRepository(pool), audit });
  const requestDeletion = createRequestSourceDeletion(createPgDeletionStore(pool, queue, AGENT_NOTIFY_QUEUE));
  const port: SourceManagementPort = {
    list: (owner) => sources.list(owner),
    checkFollow: (owner, ref) => sources.checkFollow(owner, ref),
    follow: (owner, ref, channel) => sources.follow(owner, ref, channel),
    stop: (owner, ref, channel) => sources.stop(owner, ref, channel),
    deletionTarget: (owner, ref) => sources.deletionTarget(owner, ref),
    requestDeletion: ({ owner, sourceId, title, channel, notify }) =>
      requestDeletion({ spaceId: owner.spaceId, sourceId, requestedBy: owner.userId, channel, notify, title }),
  };
  const manage = createManageSources({ sources: port, state: createPgConversationState(pool) });
  return {
    accounts: { resolve: createResolveAccount(createPgIdentityRepository(pool)), verify: auditedVerify(pool, audit) },
    async manage(ctx, text) {
      const reply = await manage(ctx, text);
      const command = reply ? parseCommand(text) : null;
      if (command) observer.command(command.kind);
      return reply;
    },
    catalog: (spaceId) => sources.catalog(spaceId),
  };
}

/** Purga da mídia da fonte; sem armazenamento configurado, não há o que purgar (nada foi guardado). */
function buildPurger(config: AppConfig, logger: Logger): MediaPurger {
  try {
    return createMediaPurger(buildObjectStore(config.media));
  } catch (error) {
    logger.warn({ reason: (error as Error).name }, "exclusão sem armazenamento de mídia configurado: só o banco é apagado");
    return { purgeSource: async () => 0 };
  }
}

const DELETION_PROBE_MS = 30_000;

/** Worker do job `sources.delete` (D-08): log sem nomes, só ids e resultado; métricas para o painel e o alerta. */
export async function startDeletionWorker(
  config: AppConfig,
  pool: Pool,
  queue: JobQueue,
  logger: Logger,
  observer: ManagementObserver = managementObserver(),
): Promise<{ stop(): void }> {
  const execute = createExecuteSourceDeletion({ store: createPgDeletionStore(pool, queue, AGENT_NOTIFY_QUEUE), purger: buildPurger(config, logger) });
  await queue.work<SourceDeleteJob>(SOURCE_DELETE_QUEUE, (job) =>
    withSpan("sources.delete", async () => {
      try {
        const outcome = await execute(job);
        logger.info({ deletionId: job.deletionId, outcome }, "exclusão de fonte processada");
        const done = outcome === "completed" ? await completedDeletion(pool, job.deletionId) : null;
        if (done) observer.deletionCompleted(done.seconds, done);
      } catch (error) {
        logger.warn({ deletionId: job.deletionId, err: { name: (error as Error).name } }, "exclusão de fonte falhou; nova tentativa agendada");
        throw error;
      }
    }),
  );
  const probe = async () => {
    try {
      const { count, oldestSeconds } = await deletionsInProgress(pool);
      observer.deletionsInProgress(count, oldestSeconds);
    } catch {
      // Sem banco, a próxima sondagem tenta de novo; o health do worker já mostra o banco fora.
    }
  };
  void probe();
  const timer = setInterval(() => void probe(), DELETION_PROBE_MS);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
