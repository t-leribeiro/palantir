// Acesso ao PostgreSQL (ADR-0002): pool único e transações explícitas.
import pg from "pg";

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

/** Executor de SQL: um pool (fora de transação) ou um client dentro de uma transação. */
export type Queryable = Pick<pg.Pool, "query"> | Pick<pg.PoolClient, "query">;

export function createPool(databaseUrl: string): Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
}

/** Roda `work` dentro de BEGIN/COMMIT; qualquer erro faz ROLLBACK e é repassado. */
export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabase(pool: Pool): Promise<"ok" | "fail"> {
  try {
    await pool.query("SELECT 1");
    return "ok";
  } catch {
    return "fail";
  }
}

/** Código SQLSTATE de violação de unicidade. */
export const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === UNIQUE_VIOLATION;
}
