// T003 (feature 009, D-08 a D-10, D-13): itens guardados com PostgreSQL real (data-delta.md §4 e §5).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOperator } from "../../src/main/seed-data.js";
import { createPgSavedItems, createSavedItems, type SavedItems } from "../../src/modules/knowledge/index.js";
import { createPgSourceContext } from "../../src/modules/retrieval/index.js";
import { insertMessageWithChunk } from "../support/chunks.js";
import { startTestDatabase, type TestDatabase } from "../support/postgres.js";
import { one } from "../support/rows.js";

let db: TestDatabase;
let saved: SavedItems;
let spaceId: string;
let savedSourceId: string;
let groupSourceId: string;
let strangerSpaceId: string;
let strangerSavedSourceId: string;

async function savedSource(space: string, account: string): Promise<string> {
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO sources (space_id, channel_account_id, external_conversation_id, title, kind, status)
     VALUES ($1, $2, 'palantir:guardados', 'Guardados', 'saved', 'authorized') RETURNING id`,
    [space, account],
  );
  return one(rows).id;
}

const message = (text: string, sourceId = savedSourceId, space = spaceId) =>
  insertMessageWithChunk(db.pool, { spaceId: space, sourceId, text, author: "Você" }).then((m) => m.messageId);

async function audioAttachment(messageId: string, sha256: string, sourceId = savedSourceId): Promise<void> {
  await db.pool.query(
    `INSERT INTO attachments (message_id, space_id, source_id, media_kind, mime_type, size_bytes, sha256, storage_key, duration_s, storage_status)
     VALUES ($1, $2, $3, 'audio', 'audio/ogg', 10, $4, $5, 102, 'stored')`,
    [messageId, spaceId, sourceId, sha256, `${spaceId}/${sourceId}/${sha256}`],
  );
}

const count = async (sql: string, params: unknown[]) => one((await db.pool.query<{ n: number }>(sql, params)).rows).n;

beforeAll(async () => {
  db = await startTestDatabase();
  const owner = await seedOperator(db.pool);
  spaceId = owner.spaceId;
  groupSourceId = owner.sourceId;
  savedSourceId = await savedSource(spaceId, owner.accountId);
  const stranger = await seedOperator(db.pool, { displayName: "Outra pessoa", accountId: "fake-stranger", conversationId: "fake-group-3" });
  strangerSpaceId = stranger.spaceId;
  strangerSavedSourceId = await savedSource(stranger.spaceId, stranger.accountId);
  saved = createSavedItems(createPgSavedItems(db.pool));
});

afterAll(async () => {
  await db?.stop();
});

describe("itens guardados", () => {
  it("guardar é idempotente pela mensagem e reaproveita o tema com o nome da primeira vez", async () => {
    const first = await message("o Temporal resolveu os workflows longos");
    const again = await saved.save(spaceId, "Arquitetura de Software", first);
    expect(await saved.save(spaceId, "Arquitetura de Software", first)).toEqual(again);
    const second = await message("filas com pg-boss");
    expect((await saved.save(spaceId, "arquitetura de software", second)).theme).toBe("Arquitetura de Software");
    expect(await count("SELECT count(*)::int AS n FROM themes WHERE space_id = $1", [spaceId])).toBe(1);
  });

  it("acha a duplicata no tema pelo texto e pelo SHA-256; em outro tema não é duplicata", async () => {
    const audio = await message("");
    await audioAttachment(audio, "c".repeat(64));
    await saved.save(spaceId, "Reuniões", audio);
    expect(await saved.isDuplicate(spaceId, "arquitetura de software", { text: "O Temporal resolveu os workflows longos." })).toBe(true);
    expect(await saved.isDuplicate(spaceId, "reunioes", { sha256: "c".repeat(64) })).toBe(true);
    expect(await saved.isDuplicate(spaceId, "Leituras", { text: "o Temporal resolveu os workflows longos" })).toBe(false);
  });

  it("lista o tema do mais recente ao mais antigo, até 9, com o total", async () => {
    for (let i = 0; i < 11; i += 1) await saved.save(spaceId, "Leituras", await message(`leitura ${i}`));
    const listing = await saved.listTheme(spaceId, "LEITURAS");
    expect(listing.theme).toBe("Leituras");
    expect(listing.total).toBe(11);
    expect(listing.items.map((i) => i.text)).toEqual(["leitura 10", "leitura 9", "leitura 8", "leitura 7", "leitura 6", "leitura 5", "leitura 4", "leitura 3", "leitura 2"]);
    expect(listing.items[0]).toMatchObject({ kind: "text" });
  });

  it("o áudio aparece com a duração; tema inexistente vem vazio", async () => {
    const listing = await saved.listTheme(spaceId, "reuniões");
    expect(listing.items[0]).toMatchObject({ kind: "text", durationSeconds: 102 });
    expect(await saved.listTheme(spaceId, "finanças")).toEqual({ theme: null, total: 0, items: [] });
  });

  it("lista os temas com a contagem, do mais recente ao mais antigo", async () => {
    expect(await saved.listThemes(spaceId)).toEqual([
      { theme: "Leituras", count: 11 },
      { theme: "Reuniões", count: 1 },
      { theme: "Arquitetura de Software", count: 2 },
    ]);
  });

  it("esquecer apaga a mensagem, o item e o tema vazio, e devolve a chave do arquivo sem outra referência", async () => {
    const shared = "d".repeat(64);
    const a = await message("");
    const b = await message("");
    await audioAttachment(a, shared);
    await audioAttachment(b, shared);
    await saved.save(spaceId, "Áudios A", a);
    await saved.save(spaceId, "Áudios B", b);

    const first = await saved.forget(spaceId, a);
    expect(first).toMatchObject({ theme: "Áudios A", orphanStorageKeys: [] });
    expect(await saved.listTheme(spaceId, "audios a")).toEqual({ theme: null, total: 0, items: [] });
    const second = await saved.forget(spaceId, b);
    expect(second?.orphanStorageKeys).toEqual([`${spaceId}/${savedSourceId}/${shared}`]);
    expect(await count("SELECT count(*)::int AS n FROM messages WHERE id = ANY($1)", [[a, b]])).toBe(0);
  });

  it("esquecer recusa mensagem que não é guardada ou é de outro espaço", async () => {
    const fromGroup = await message("de um grupo", groupSourceId);
    expect(await saved.savedMessage(spaceId, fromGroup)).toBeNull();
    expect(await saved.forget(spaceId, fromGroup)).toBeNull();
    const strangers = await message("do outro dono", strangerSavedSourceId, strangerSpaceId);
    await saved.save(strangerSpaceId, "Dele", strangers);
    expect(await saved.forget(spaceId, strangers)).toBeNull();
    expect(await saved.forget(spaceId, randomUUID())).toBeNull();
    expect(await count("SELECT count(*)::int AS n FROM messages WHERE id = ANY($1)", [[fromGroup, strangers]])).toBe(2);
  });

  it("o contexto do guardado traz o tema no título e nenhuma vizinha (D-11)", async () => {
    const before = await message("guardado antes");
    const target = await message("o guardado citado");
    const after = await message("guardado depois");
    for (const id of [before, target, after]) await saved.save(spaceId, "Contexto", id);
    const result = await createPgSourceContext(db.pool).around(spaceId, target, 3);
    expect(result).toMatchObject({ status: "found", before: [], after: [], message: { sourceTitle: "Guardados · Contexto", savedTheme: "Contexto", text: "o guardado citado" } });
    const fromGroup = await message("de um grupo", groupSourceId);
    const group = await createPgSourceContext(db.pool).around(spaceId, fromGroup, 3);
    expect(group.status === "found" ? group.message.savedTheme : "não achou").toBeUndefined();
  });

  it("outro espaço nunca aparece, nem deixa guardar mensagem alheia", async () => {
    expect((await saved.listThemes(strangerSpaceId)).map((t) => t.theme)).toEqual(["Dele"]);
    const mine = await message("minha");
    await expect(saved.save(strangerSpaceId, "Dele", mine)).rejects.toThrow(/espaço/);
  });
});
