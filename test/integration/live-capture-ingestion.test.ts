// T003 (feature 004, RF-06 e RF-07; D-09): reconciliação ao vivo × importada com PostgreSQL real.
// A mesma mensagem, capturada ao vivo e depois importada (ou o contrário), fica com um registro e duas proveniências.
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CanonicalMessage, IngestOutcome } from "../../src/contracts/channel/knowledge-channel.js";
import { seedOperator } from "../../src/main/seed-data.js";
import { createPgIdentityRepository, createResolveUserByChannelAccount } from "../../src/modules/identity/index.js";
import { INDEX_QUEUE, createIngestMessage, createPgUnitOfWork } from "../../src/modules/ingestion/index.js";
import {
  createEnsureImportSource,
  createIsSourceAuthorized,
  createPgImportSourceRepository,
  createPgSourceRepository,
} from "../../src/modules/sources/index.js";
import { createJobQueue, type JobQueue } from "../../src/platform/queue/index.js";
import { newId } from "../../src/shared/index.js";
import { canonicalMessage } from "../support/messages.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";

let db: TestDatabase;
let queue: JobQueue;
let accountId: string;
let conversationId: string;
let sourceId: string;
let seq = 0;

beforeAll(async () => {
  db = await startTestDatabase();
  queue = createJobQueue(db.url, [{ name: INDEX_QUEUE, retryLimit: 5, retryDelaySeconds: 2, expireInSeconds: 60, deadLetter: `${INDEX_QUEUE}.dead` }]);
  await queue.start();
  await seedOperator(db.pool);
  const operator = await createResolveUserByChannelAccount(createPgIdentityRepository(db.pool))("fake", "fake-operator");
  if (!operator) throw new Error("seed sem operador");
  const source = await createEnsureImportSource(createPgImportSourceRepository(db.pool))(operator, "Grupo de teste");
  ({ accountId, conversationId, sourceId } = source);
});

afterAll(async () => {
  await queue?.stop();
  await db?.stop();
});

beforeEach(async () => {
  await db.pool.query("DELETE FROM messages WHERE source_id = $1", [sourceId]);
});

const ingest = () =>
  createIngestMessage({
    sources: { check: createIsSourceAuthorized(createPgSourceRepository(db.pool)) },
    unitOfWork: createPgUnitOfWork(db.pool, queue),
    ids: newId,
  });

const BASE = Date.parse("2026-11-23T14:00:00Z");
const at = (offsetSeconds: number) => new Date(BASE + offsetSeconds * 1000).toISOString();

function live(text: string, offsetSeconds: number, author = { externalId: "+5511988887777", displayName: "Ana Souza" }): CanonicalMessage {
  seq += 1;
  return canonicalMessage({
    id: newId(),
    source: { provider: "whatsapp", accountId, conversationId, externalMessageId: `LIVE-${seq}` },
    sender: author,
    timestamp: at(offsetSeconds),
    text,
    provenance: { captureMethod: "live", capturedAt: at(offsetSeconds + 1), adapter: "whatsapp" },
  });
}

/** O export só tem hora e minuto: o horário cai no início do minuto. */
function imported(text: string, offsetSeconds: number, ordinal = 0, author = { externalId: "ana", displayName: "Ana" }): CanonicalMessage {
  const minute = Math.floor((BASE + offsetSeconds * 1000) / 60_000) * 60_000;
  const importKey = createHash("sha256").update(`${minute}|${author.displayName}|${text}|${ordinal}`).digest("hex");
  return canonicalMessage({
    id: newId(),
    source: { provider: "whatsapp", accountId, conversationId, importKey },
    sender: author,
    timestamp: new Date(minute).toISOString(),
    text,
    provenance: { captureMethod: "export_import", capturedAt: at(3600), adapter: "whatsapp-export" },
  });
}

async function ingestAll(messages: CanonicalMessage[]): Promise<IngestOutcome[]> {
  const run = ingest();
  const out: IngestOutcome[] = [];
  for (const m of messages) out.push(await run(m));
  return out;
}

const outcomes = (list: IngestOutcome[]) => list.map((o) => o.outcome);

async function countMessages(): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM messages WHERE source_id = $1", [sourceId]);
  return rows[0]?.n ?? 0;
}

describe("reconciliação ao vivo × importada (D-09)", () => {
  it("20 ao vivo e depois a importação das mesmas: 20 reconciliadas, 20 registros; a reimportação é duplicata", async () => {
    const texts = Array.from({ length: 20 }, (_, i) => `mensagem número ${i} sobre observabilidade`);
    expect(outcomes(await ingestAll(texts.map((t, i) => live(t, i * 7))))).toEqual(Array(20).fill("accepted"));

    const firstImport = await ingestAll(texts.map((t, i) => imported(t, i * 7)));
    expect(outcomes(firstImport)).toEqual(Array(20).fill("reconciled"));
    expect(await countMessages()).toBe(20);

    expect(outcomes(await ingestAll(texts.map((t, i) => imported(t, i * 7))))).toEqual(Array(20).fill("duplicate"));
    expect(await countMessages()).toBe(20);
  });

  it("a reconciliada mantém texto e autor ao vivo e ganha as duas proveniências", async () => {
    const [accepted] = await ingestAll([live("Recomendo o Grafana Tempo para traces", 30)]);
    const [reconciled] = await ingestAll([imported("Recomendo o Grafana Tempo  para traces", 30)]);
    expect(reconciled).toEqual({ outcome: "reconciled", messageId: (accepted as { messageId: string }).messageId });
    const { rows } = await db.pool.query<{ text: string; display_name: string; methods: string[]; import_key: string | null }>(
      `SELECT m.text, p.display_name, m.import_key,
              array_agg(mp.capture_method ORDER BY mp.capture_method) AS methods
         FROM messages m JOIN participants p ON p.id = m.participant_id
         JOIN message_provenance mp ON mp.message_id = m.id
        WHERE m.source_id = $1 GROUP BY m.id, p.display_name`,
      [sourceId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ text: "Recomendo o Grafana Tempo para traces", display_name: "Ana Souza", methods: ["export_import", "live"] });
    expect(rows[0]?.import_key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("importada primeiro e ao vivo depois também reconcilia; a reentrega ao vivo é duplicata", async () => {
    await ingestAll([imported("deploy às 18h", 10)]);
    const message = live("deploy às 18h", 10);
    expect(outcomes(await ingestAll([message]))).toEqual(["reconciled"]);
    expect(outcomes(await ingestAll([message]))).toEqual(["duplicate"]);
    expect(await countMessages()).toBe(1);
  });

  it("dois 'ok' iguais no mesmo minuto casam um a um", async () => {
    await ingestAll([live("ok", 5, { externalId: "+5511911112222", displayName: "Bruno" }), live("ok", 20, { externalId: "+5511933334444", displayName: "Carla" })]);
    const result = await ingestAll([
      imported("ok", 5, 0, { externalId: "bruno", displayName: "Bruno" }),
      imported("ok", 20, 1, { externalId: "carla", displayName: "Carla" }),
    ]);
    expect(outcomes(result)).toEqual(["reconciled", "reconciled"]);
    const ids = result.map((r) => (r as { messageId: string }).messageId);
    expect(new Set(ids).size).toBe(2);
    expect(await countMessages()).toBe(2);
  });

  it("diferença acima de 60 s não reconcilia", async () => {
    await ingestAll([live("reunião amanhã", 0)]);
    const late = imported("reunião amanhã", 0);
    const shifted = { ...late, timestamp: new Date(BASE + 61_000).toISOString() };
    expect(outcomes(await ingestAll([shifted]))).toEqual(["accepted"]);
    expect(await countMessages()).toBe(2);
  });

  it("texto diferente não reconcilia", async () => {
    await ingestAll([live("vamos usar Kafka", 0)]);
    expect(outcomes(await ingestAll([imported("vamos usar Redis", 0)]))).toEqual(["accepted"]);
  });
});
