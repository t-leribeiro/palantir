// T003 (feature 005): migração 0007 com PostgreSQL real (data-delta.md).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOperator } from "../../src/main/seed-data.js";
import { createPgIdentityRepository, createResolveUserByChannelAccount } from "../../src/modules/identity/index.js";
import { createEnsureImportSource, createPgImportSourceRepository } from "../../src/modules/sources/index.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";
import { one } from "../support/rows.js";

let db: TestDatabase;
let spaceId: string;
let sourceId: string;
let participantId: string;
const SHA = "a".repeat(64);

beforeAll(async () => {
  db = await startTestDatabase();
  await seedOperator(db.pool);
  const operator = await createResolveUserByChannelAccount(createPgIdentityRepository(db.pool))("fake", "fake-operator");
  if (!operator) throw new Error("seed sem operador");
  spaceId = operator.spaceId;
  sourceId = (await createEnsureImportSource(createPgImportSourceRepository(db.pool))(operator, "Áudios")).sourceId;
  const { rows } = await db.pool.query<{ id: string }>(
    "INSERT INTO participants (source_id, external_id, display_name) VALUES ($1, 'ana', 'Ana') RETURNING id",
    [sourceId],
  );
  participantId = one(rows).id;
});

afterAll(async () => {
  await db?.stop();
});

async function audioMessage(): Promise<string> {
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO messages (id, space_id, source_id, participant_id, kind, sent_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'audio', now()) RETURNING id`,
    [spaceId, sourceId, participantId],
  );
  return one(rows).id;
}

async function storedAttachment(messageId: string): Promise<string> {
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO attachments (message_id, space_id, source_id, media_kind, mime_type, sha256, storage_key, duration_s, storage_status)
     VALUES ($1, $2, $3, 'audio', 'audio/ogg', $4, $5, 12.5, 'stored') RETURNING id`,
    [messageId, spaceId, sourceId, SHA, `${spaceId}/${sourceId}/${SHA}`],
  );
  return one(rows).id;
}

async function transcript(attachmentId: string, active: boolean) {
  return db.pool.query<{ id: string }>(
    `INSERT INTO transcripts (attachment_id, space_id, engine, model, model_version, language, text, empty, is_active)
     VALUES ($1, $2, 'fake', 'm', 'v1', 'pt', 'olá', false, $3) RETURNING id`,
    [attachmentId, spaceId, active],
  );
}

describe("0007_media", () => {
  it("anexo guardado nasce pendente; indisponível exige o motivo e não tem chave", async () => {
    const stored = await storedAttachment(await audioMessage());
    const { rows } = await db.pool.query("SELECT processing_status FROM attachments WHERE id = $1", [stored]);
    expect(rows[0].processing_status).toBe("pending");

    const missing = await audioMessage();
    await db.pool.query(
      `INSERT INTO attachments (message_id, space_id, source_id, media_kind, mime_type, storage_status, unavailable_reason, processing_status)
       VALUES ($1, $2, $3, 'audio', 'audio/ogg', 'unavailable', 'missing_in_export', 'not_applicable')`,
      [missing, spaceId, sourceId],
    );
    await expect(
      db.pool.query(
        `INSERT INTO attachments (message_id, space_id, source_id, media_kind, mime_type, storage_status)
         VALUES ($1, $2, $3, 'audio', 'audio/ogg', 'unavailable')`,
        [await audioMessage(), spaceId, sourceId],
      ),
    ).rejects.toThrow(/check/i);
  });

  it("um anexo por mensagem", async () => {
    const message = await audioMessage();
    await storedAttachment(message);
    await expect(storedAttachment(message)).rejects.toThrow(/attachments_one_per_message/);
  });

  it("RN-03: só uma transcrição ativa por anexo; versões inativas ficam guardadas", async () => {
    const attachment = await storedAttachment(await audioMessage());
    await transcript(attachment, true);
    await expect(transcript(attachment, true)).rejects.toThrow(/transcripts_one_active/);
    await transcript(attachment, false);
    const { rows } = await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM transcripts WHERE attachment_id = $1", [attachment]);
    expect(one(rows).n).toBe(2);
  });

  it("segmento com fim antes do início é recusado", async () => {
    const attachment = await storedAttachment(await audioMessage());
    const { rows } = await transcript(attachment, true);
    await expect(
      db.pool.query("INSERT INTO transcript_segments (transcript_id, idx, start_s, end_s, text) VALUES ($1, 0, 5, 4, 'x')", [one(rows).id]),
    ).rejects.toThrow(/check/i);
  });

  it("trecho indexado aceita faixa de áudio válida e recusa faixa invertida", async () => {
    const message = await audioMessage();
    await db.pool.query(
      "INSERT INTO message_chunks (space_id, message_id, idx, text, audio_start_s, audio_end_s) VALUES ($1, $2, 1, 'fala', 3.2, 9.8)",
      [spaceId, message],
    );
    await expect(
      db.pool.query(
        "INSERT INTO message_chunks (space_id, message_id, idx, text, audio_start_s, audio_end_s) VALUES ($1, $2, 2, 'fala', 9, 3)",
        [spaceId, message],
      ),
    ).rejects.toThrow(/message_chunks_audio_range/);
  });

  it("apagar a mensagem apaga anexo, transcrições e segmentos em cascata", async () => {
    const message = await audioMessage();
    const attachment = await storedAttachment(message);
    const { rows } = await transcript(attachment, true);
    await db.pool.query("INSERT INTO transcript_segments (transcript_id, idx, start_s, end_s, text) VALUES ($1, 0, 0, 2, 'olá')", [one(rows).id]);
    await db.pool.query("DELETE FROM messages WHERE id = $1", [message]);
    const left = await db.pool.query<{ n: number }>(
      "SELECT (SELECT count(*) FROM attachments WHERE id = $1) + (SELECT count(*) FROM transcripts WHERE attachment_id = $1) AS n",
      [attachment],
    );
    expect(Number(one(left.rows).n)).toBe(0);
  });
});
