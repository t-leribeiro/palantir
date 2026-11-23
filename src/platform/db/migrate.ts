// Runner das migrações SQL versionadas em migrations/ (D-07).
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../../migrations", import.meta.url));

export async function migrate(databaseUrl: string, direction: "up" | "down" = "up"): Promise<string[]> {
  const applied = await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction,
    migrationsTable: "pgmigrations",
    ...(direction === "down" ? { count: Number.POSITIVE_INFINITY } : {}),
    singleTransaction: true,
    checkOrder: true,
    log: () => undefined,
  });
  return applied.map((m) => m.name);
}
