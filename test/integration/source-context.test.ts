// T003 (feature 008, D-04, D-05): busca por contexto com PostgreSQL real (data-delta.md §2).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOperator } from "../../src/main/seed-data.js";
import { createPgSourceContext, type SourceContextResult } from "../../src/modules/retrieval/index.js";
import { insertMessageWithChunk } from "../support/chunks.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";
import { one } from "../support/rows.js";

let db: TestDatabase;
let spaceId: string;
let sourceId: string;
const ids: string[] = [];

const at = (minute: number) => new Date(Date.UTC(2026, 10, 12, 17, minute));

beforeAll(async () => {
  db = await startTestDatabase();
  ({ spaceId, sourceId } = await seedOperator(db.pool));
  // 9 mensagens na mesma conversa; a 3 e a 4 no mesmo minuto (o export só tem minuto); da 6 em diante, no dia seguinte.
  const nextDay = (minute: number) => new Date(Date.UTC(2026, 10, 13, 9, minute));
  const sentAts = [at(0), at(1), at(2), at(3), at(3), at(5), nextDay(0), nextDay(7), nextDay(8)];
  for (const [i, sentAt] of sentAts.entries()) {
    ids.push((await insertMessageWithChunk(db.pool, { spaceId, sourceId, text: `mensagem ${i}`, author: i % 2 ? "Bruno" : "Ana", sentAt })).messageId);
  }
  // Mesmo minuto em outra conversa do mesmo espaço e em outro espaço: nunca entram como vizinhas.
  const other = await seedOperator(db.pool, { conversationId: "fake-group-2", conversationTitle: "Outra conversa" });
  await insertMessageWithChunk(db.pool, { spaceId, sourceId: other.sourceId, text: "de outra conversa", sentAt: at(3) });
  const stranger = await seedOperator(db.pool, { displayName: "Outra pessoa", accountId: "fake-stranger", conversationId: "fake-group-3" });
  await insertMessageWithChunk(db.pool, { spaceId: stranger.spaceId, sourceId: stranger.sourceId, text: "de outro espaço", sentAt: at(3) });
});

afterAll(async () => {
  await db?.stop();
});

const texts = (result: SourceContextResult) => {
  if (result.status !== "found") throw new Error(result.status);
  return { before: result.before.map((m) => m.text), target: result.message.text, after: result.after.map((m) => m.text) };
};

describe("busca por contexto", () => {
  it("devolve a citada inteira e até 3 vizinhas de cada lado, em ordem, só da mesma conversa", async () => {
    const context = createPgSourceContext(db.pool);
    const result = await context.around(spaceId, ids[5] ?? "", 3);
    expect(texts(result)).toEqual({ before: ["mensagem 2", "mensagem 3", "mensagem 4"], target: "mensagem 5", after: ["mensagem 6", "mensagem 7", "mensagem 8"] });
    if (result.status !== "found") return;
    expect(result.message).toMatchObject({ messageId: ids[5], author: "Bruno", sourceTitle: "Grupo de teste", kind: "text" });
    expect(result.before[0]).toMatchObject({ author: "Ana", sentAt: at(2) });
  });

  it("no mesmo minuto, vale a ordem em que as mensagens foram gravadas (a do arquivo exportado)", async () => {
    const context = createPgSourceContext(db.pool);
    expect(texts(await context.around(spaceId, ids[3] ?? "", 3))).toEqual({ before: ["mensagem 0", "mensagem 1", "mensagem 2"], target: "mensagem 3", after: ["mensagem 4", "mensagem 5", "mensagem 6"] });
    expect(texts(await context.around(spaceId, ids[4] ?? "", 3)).before).toEqual(["mensagem 1", "mensagem 2", "mensagem 3"]);
  });

  it("na ponta da conversa vêm só as que existem", async () => {
    const context = createPgSourceContext(db.pool);
    expect(texts(await context.around(spaceId, ids[0] ?? "", 3))).toEqual({ before: [], target: "mensagem 0", after: ["mensagem 1", "mensagem 2", "mensagem 3"] });
    expect(texts(await context.around(spaceId, ids[8] ?? "", 3)).after).toEqual([]);
  });

  it("de outro espaço ou inexistente é not_found; fonte em exclusão é deleted", async () => {
    const context = createPgSourceContext(db.pool);
    const stranger = await seedOperator(db.pool, { displayName: "Outra pessoa", accountId: "fake-stranger", conversationId: "fake-group-3" });
    expect(await context.around(stranger.spaceId, ids[4] ?? "", 3)).toEqual({ status: "not_found" });
    expect(await context.around(spaceId, "00000000-0000-4000-8000-000000000000", 3)).toEqual({ status: "not_found" });
    const doomed = await seedOperator(db.pool, { conversationId: "fake-group-4", conversationTitle: "Vai ser apagada" });
    const { messageId } = await insertMessageWithChunk(db.pool, { spaceId, sourceId: doomed.sourceId, text: "x" });
    await db.pool.query("UPDATE sources SET status = 'deleting' WHERE id = $1", [doomed.sourceId]);
    expect(await context.around(spaceId, messageId, 3)).toEqual({ status: "deleted" });
  });

  it("áudio traz o arquivo, a duração, o estado e a transcrição ativa com os segmentos; vizinha de áudio traz o texto da transcrição", async () => {
    const audioSource = await seedOperator(db.pool, { conversationId: "fake-group-5", conversationTitle: "Áudios" });
    const before = await insertMessageWithChunk(db.pool, { spaceId, sourceId: audioSource.sourceId, text: "antes", sentAt: at(10) });
    const audio = await insertMessageWithChunk(db.pool, { spaceId, sourceId: audioSource.sourceId, text: "", kind: "audio", sentAt: at(11) });
    const attachmentId = one(
      (
        await db.pool.query<{ id: string }>(
          `INSERT INTO attachments (message_id, space_id, source_id, media_kind, mime_type, sha256, storage_key, size_bytes, duration_s, storage_status, processing_status)
           VALUES ($1, $2, $3, 'audio', 'audio/ogg; codecs=opus', repeat('a', 64), 'k/1', 2048, 102.4, 'stored', 'done') RETURNING id`,
          [audio.messageId, spaceId, audioSource.sourceId],
        )
      ).rows,
    ).id;
    const transcriptId = one(
      (
        await db.pool.query<{ id: string }>(
          `INSERT INTO transcripts (attachment_id, space_id, engine, model, model_version, language, text, empty, is_active)
           VALUES ($1, $2, 'fake', 'm', '1', 'pt', 'bom dia o SLA caiu', false, true) RETURNING id`,
          [attachmentId, spaceId],
        )
      ).rows,
    ).id;
    await db.pool.query("INSERT INTO transcript_segments (transcript_id, idx, start_s, end_s, text) VALUES ($1, 0, 0, 12, 'bom dia'), ($1, 1, 37, 45, 'o SLA caiu')", [transcriptId]);

    const context = createPgSourceContext(db.pool);
    const result = await context.around(spaceId, audio.messageId, 3);
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.message.kind).toBe("audio");
    expect(result.message.audio).toEqual({
      attachmentId,
      mimeType: "audio/ogg; codecs=opus",
      sizeBytes: 2048,
      durationSeconds: 102.4,
      stored: true,
      processing: "done",
      segments: [
        { start: 0, end: 12, text: "bom dia" },
        { start: 37, end: 45, text: "o SLA caiu" },
      ],
    });
    expect(result.before.map((m) => m.messageId)).toEqual([before.messageId]);
    const fromSide = await context.around(spaceId, before.messageId, 3);
    expect(fromSide.status === "found" && fromSide.after[0]).toMatchObject({ kind: "audio", text: "bom dia o SLA caiu", durationSeconds: 102.4 });
  });
});
