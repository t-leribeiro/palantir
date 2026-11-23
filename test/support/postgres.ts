// PostgreSQL real em container para testes de integração (Testcontainers + migrações do projeto).
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPool, migrate, type Pool } from "../../src/platform/db/index.js";

export const POSTGRES_IMAGE = "pgvector/pgvector:0.8.7-pg16";

export interface TestDatabase {
  container: StartedPostgreSqlContainer;
  pool: Pool;
  url: string;
  stop(): Promise<void>;
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const url = container.getConnectionUri();
  await migrate(url);
  const pool = createPool(url);
  return {
    container,
    pool,
    url,
    async stop() {
      await pool.end();
      await container.stop();
    },
  };
}
