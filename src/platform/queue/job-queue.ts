// Fila de jobs no PostgreSQL com pg-boss (ADR-0003). Enviar dentro de uma transação usa o mesmo
// client da aplicação, então o job só existe se o COMMIT acontecer.
import { PgBoss } from "pg-boss";
import { createPool, type Queryable } from "../db/index.js";

export interface QueueDefinition {
  readonly name: string;
  readonly retryLimit: number;
  readonly retryDelaySeconds: number;
  readonly expireInSeconds: number;
  readonly deadLetter?: string;
}

export interface JobQueue {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Enfileira usando o client de uma transação aberta (atomicidade com a gravação). */
  sendInTransaction(client: Queryable, queue: string, data: object, options?: SendOptions): Promise<void>;
  /** Consome a fila; o handler recebe se esta é a última tentativa (feature 005: grava `failed` antes de desistir). */
  work<T extends object>(queue: string, handler: (data: T, attempt: JobAttempt) => Promise<void>, options?: WorkOptions): Promise<void>;
  check(): Promise<"ok" | "fail">;
  /** Jobs em espera ou em execução (usado por testes e health). */
  pendingCount(queue: string): Promise<number>;
}

export interface SendOptions {
  readonly singletonKey?: string;
  /** Maior primeiro (feature 005, RN-07). */
  readonly priority?: number;
  readonly expireInSeconds?: number;
}

export interface WorkOptions {
  /** Jobs em paralelo neste processo (padrão 1). */
  readonly concurrency?: number;
}

export interface JobAttempt {
  readonly retryCount: number;
  readonly retryLimit: number;
  readonly lastAttempt: boolean;
}

export function createJobQueue(databaseUrl: string, queues: readonly QueueDefinition[]): JobQueue {
  const boss = new PgBoss({ connectionString: databaseUrl, schema: "pgboss" });
  const byName = new Map(queues.map((q) => [q.name, q]));
  // Contagens direto na tabela: as estatísticas do pg-boss são atualizadas com atraso.
  const stats = createPool(databaseUrl);
  let started = false;

  return {
    async start() {
      if (started) return;
      boss.on("error", () => undefined);
      await boss.start();
      for (const q of queues) {
        if (q.deadLetter) await ensureQueue(boss, { name: q.deadLetter, retryLimit: 0, retryDelaySeconds: 0, expireInSeconds: 60 });
        await ensureQueue(boss, q);
      }
      started = true;
    },
    async stop() {
      if (!started) return;
      await boss.stop({ graceful: true, timeout: 10_000 });
      await stats.end();
      started = false;
    },
    async sendInTransaction(client, queue, data, options = {}) {
      const def = byName.get(queue);
      if (!def) throw new Error(`Fila não declarada: ${queue}`);
      const id = await boss.send(queue, data, {
        db: { executeSql: (text, values) => client.query(text, values as unknown[]) },
        ...(options.singletonKey ? { singletonKey: options.singletonKey } : {}),
        ...(options.priority === undefined ? {} : { priority: options.priority }),
        ...(options.expireInSeconds === undefined ? {} : { expireInSeconds: options.expireInSeconds }),
      });
      if (id === null && !options.singletonKey) throw new Error(`pg-boss recusou o job na fila ${queue}`);
    },
    async work(queue, handler, options = {}) {
      const work = { batchSize: 1, pollingIntervalSeconds: 0.5, includeMetadata: true, localConcurrency: options.concurrency ?? 1 } as const;
      await boss.work<object>(queue, work, async (jobs) => {
        for (const job of jobs) {
          // includeMetadata: o pg-boss devolve as tentativas junto do job.
          const { retryCount, retryLimit } = job as unknown as { retryCount: number; retryLimit: number };
          await handler(job.data as never, { retryCount, retryLimit, lastAttempt: retryCount >= retryLimit });
        }
      });
    },
    async check() {
      try {
        await stats.query("SELECT 1 FROM pgboss.job LIMIT 1");
        return "ok";
      } catch {
        return "fail";
      }
    },
    async pendingCount(queue) {
      const { rows } = await stats.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM pgboss.job WHERE name = $1 AND state IN ('created', 'retry', 'active')",
        [queue],
      );
      return rows[0]?.n ?? 0;
    },
  };
}

async function ensureQueue(boss: PgBoss, q: QueueDefinition): Promise<void> {
  const options = {
    retryLimit: q.retryLimit,
    retryDelay: q.retryDelaySeconds,
    retryBackoff: q.retryLimit > 0,
    expireInSeconds: q.expireInSeconds,
    ...(q.deadLetter ? { deadLetter: q.deadLetter } : {}),
  };
  if (await boss.getQueue(q.name)) await boss.updateQueue(q.name, options);
  else await boss.createQueue(q.name, options);
}
