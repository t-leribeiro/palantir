// npm run media:conferir (feature 005, interfaces/cli-importacao-e-medicao.md §4): sorteia até 3 objetos
// guardados e confere, sem mostrar nem tocar o conteúdo, que estão cifrados, que a chave do .env decifra e
// que o SHA-256 bate com o registrado. Desde a feature 006 (T023), conta também os objetos de conversas apagadas,
// que não podem existir. A saída não mostra chaves de objeto nem nomes de arquivo.
import { createHash } from "node:crypto";
import { buildObjectStore } from "../src/main/media.js";
import { isSealed, looksLikeOgg, type S3ObjectStore } from "../src/modules/media/index.js";
import { loadConfig } from "../src/platform/config.js";
import { createPool, type Pool } from "../src/platform/db/index.js";
import { countOrphans } from "./media/orphans.js";

async function checkSample(pool: Pool, store: S3ObjectStore): Promise<string[]> {
  const { rows } = await pool.query<{ storage_key: string; sha256: string }>(
    "SELECT storage_key, sha256 FROM attachments WHERE storage_status = 'stored' ORDER BY random() LIMIT 3",
  );
  if (rows.length === 0) {
    console.log("Nenhum arquivo de mídia guardado ainda.");
    return [];
  }
  const failures: string[] = [];
  for (const [i, row] of rows.entries()) {
    const raw = await store.getRaw(row.storage_key);
    if (!isSealed(raw) || looksLikeOgg(raw)) failures.push(`objeto ${i + 1}: não está cifrado`);
    const plain = await store.get(row.storage_key).catch(() => undefined);
    if (!plain) failures.push(`objeto ${i + 1}: a chave atual não decifra`);
    else if (createHash("sha256").update(plain).digest("hex") !== row.sha256) failures.push(`objeto ${i + 1}: hash não confere`);
  }
  if (failures.length === 0) console.log(`${rows.length} objetos conferidos: cifrados, decifráveis com a chave atual, hash confere.`);
  return failures;
}

async function checkOrphans(pool: Pool, store: S3ObjectStore): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>("SELECT id FROM sources");
  const orphans = countOrphans(await store.listKeys(), new Set(rows.map((r) => r.id)));
  if (orphans === 0) {
    console.log("Nenhum objeto de conversa apagada no armazenamento.");
    return [];
  }
  return [`${orphans} objeto(s) de conversas que não existem mais: a exclusão não terminou (confira npm run auditoria)`];
}

const config = loadConfig();
const store = buildObjectStore(config.media);
const pool = createPool(config.databaseUrl);
try {
  const failures = [...(await checkSample(pool, store)), ...(await checkOrphans(pool, store))];
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
