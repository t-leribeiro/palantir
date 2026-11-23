// T055: teste de carga da ingestão (meta ≥ 200 msg/s, latência P95 ≤ 50 ms), insumo do critério de
// migração para Redis do ADR-0003. Uso: npm run test:load [-- <mensagens> <concorrência>]
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { QUEUES } from "../../src/main/compose.js";
import { seedOperator } from "../../src/main/seed-data.js";
import { createIngestMessage, createPgUnitOfWork } from "../../src/modules/ingestion/index.js";
import { createIsSourceAuthorized, createPgSourceRepository } from "../../src/modules/sources/index.js";
import { createPool, migrate } from "../../src/platform/db/index.js";
import { createJobQueue } from "../../src/platform/queue/index.js";
import { newId } from "../../src/shared/index.js";
import { canonicalMessage } from "../support/messages.js";

const TOTAL = Number(process.argv[2] ?? 2000);
// Padrão = tamanho do pool (10): acima disso a latência mede espera por conexão, não a fila (ADR-0003).
const CONCURRENCY = Number(process.argv[3] ?? 10);
const TARGET_RATE = 200;
const TARGET_P95_MS = 50;

const container = await new PostgreSqlContainer("pgvector/pgvector:0.8.7-pg16").start();
const url = container.getConnectionUri();
await migrate(url);
const pool = createPool(url);
await seedOperator(pool);
const queue = createJobQueue(url, QUEUES);
await queue.start();
const ingest = createIngestMessage({
  sources: { check: createIsSourceAuthorized(createPgSourceRepository(pool)) },
  unitOfWork: createPgUnitOfWork(pool, queue),
  ids: newId,
});

const latencies: number[] = [];
let next = 0;
async function lane(): Promise<void> {
  while (next < TOTAL) {
    const i = next++;
    const message = canonicalMessage({
      id: newId(),
      source: { provider: "fake", accountId: "fake-operator", conversationId: "fake-group-1", externalMessageId: `load-${i}` },
      sender: { externalId: `autor-${i % 25}`, displayName: `Autor ${i % 25}` },
      text: `Mensagem de carga ${i} sobre observabilidade, custos e arquitetura`,
    });
    const started = performance.now();
    const outcome = await ingest(message);
    latencies.push(performance.now() - started);
    if (outcome.outcome !== "accepted") throw new Error(`mensagem ${i} não aceita: ${outcome.outcome}`);
  }
}

const started = performance.now();
await Promise.all(Array.from({ length: CONCURRENCY }, lane));
const elapsedSeconds = (performance.now() - started) / 1000;
latencies.sort((a, b) => a - b);
const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
const rate = TOTAL / elapsedSeconds;
const pending = await queue.pendingCount(QUEUES[0]?.name ?? "");

console.log(`Mensagens: ${TOTAL} | concorrência: ${CONCURRENCY} | tempo: ${elapsedSeconds.toFixed(2)} s`);
console.log(`Vazão: ${rate.toFixed(0)} msg/s (meta ≥ ${TARGET_RATE})`);
console.log(`Latência por mensagem (gravar + enfileirar) P95: ${p95.toFixed(1)} ms (meta ≤ ${TARGET_P95_MS})`);
console.log(`Jobs de indexação enfileirados: ${pending} (esperado ${TOTAL})`);
console.log(rate >= TARGET_RATE && p95 <= TARGET_P95_MS && pending === TOTAL ? "Resultado: dentro das metas do ADR-0003." : "Resultado: FORA das metas: avaliar a migração para Redis (ADR-0003).");

await queue.stop();
await pool.end();
await container.stop();
