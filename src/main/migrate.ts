// npm run db:migrate
import { migrate } from "../platform/db/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL não definido. Rode `npm run setup` para gerar o .env.");
  process.exit(1);
}
const direction = process.argv[2] === "down" ? "down" : "up";
const applied = await migrate(databaseUrl, direction);
console.error(applied.length === 0 ? "Nenhuma migração pendente." : `Migrações (${direction}): ${applied.join(", ")}`);
