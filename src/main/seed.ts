// npm run seed
import { createPool } from "../platform/db/index.js";
import { seedOperator } from "./seed-data.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL não definido. Rode `npm run setup` para gerar o .env.");
  process.exit(1);
}
const pool = createPool(databaseUrl);
try {
  const result = await seedOperator(pool);
  console.error(`Seed ok: conta fake "fake-operator", fonte "fake-group-1" (Grupo de teste) autorizada. Espaço ${result.spaceId}.`);
} finally {
  await pool.end();
}
