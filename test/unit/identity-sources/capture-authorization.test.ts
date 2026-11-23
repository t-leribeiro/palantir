// T006 (feature 004, RN-01, RN-02, RN-05, RN-06; D-04 a D-08): autorização de captura de grupos.
import { describe, expect, it } from "vitest";
import {
  assertSameConversation,
  createCaptureAdmin,
  createRouteGroup,
  createSyncGroupDirectory,
  resolveGroupRef,
  sortGroups,
  validateConsent,
  type CaptureRecord,
  type CaptureRepository,
  type CaptureRoute,
  type DirectoryGroup,
  type GroupDirectory,
} from "../../../src/modules/sources/application/capture-authorization.js";
import type { ImportSourceRepository } from "../../../src/modules/sources/index.js";

const NOW = new Date("2026-11-23T17:40:00Z");
const OWNER = { userId: "u1", spaceId: "space-1" };
const CONSENT = "todos avisados em 23/11, ninguém se opôs";

function memoryDirectory(initial: DirectoryGroup[] = []): GroupDirectory & { rows: DirectoryGroup[] } {
  const rows = [...initial];
  return {
    rows,
    async upsert(groups, seenAt) {
      for (const g of groups) {
        const i = rows.findIndex((r) => r.groupId === g.groupId);
        const row = { ...g, seenAt, leftAt: null };
        if (i >= 0) rows[i] = row;
        else rows.push(row);
      }
    },
    async markMissingAsLeft(present, at) {
      for (const [i, r] of rows.entries()) if (!present.includes(r.groupId) && !r.leftAt) rows[i] = { ...r, leftAt: at };
    },
    async list() {
      return rows;
    },
  };
}

function memoryCaptures(owned: Record<string, { sourceId: string; title: string }> = {}) {
  const records: (CaptureRecord & { consent: string; authorizedBy: string })[] = [];
  const repo: CaptureRepository = {
    async latestByGroup() {
      const latest = new Map<string, CaptureRecord>();
      for (const r of records) latest.set(r.groupId, r);
      return [...latest.values()];
    },
    async route(_provider, groupId): Promise<CaptureRoute | null> {
      const active = records.find((r) => r.groupId === groupId && !r.revokedAt);
      return active ? { provider: "whatsapp", accountId: "+5511988887777", conversationId: `conv:${active.sourceId}`, sourceId: active.sourceId, authorizedAt: active.authorizedAt } : null;
    },
    async findOwnedSource(userId, _provider, conversationId) {
      return owned[`${userId}|${conversationId}`] ?? null;
    },
    async create(input) {
      records.push({ groupId: input.groupId, sourceId: input.sourceId, sourceTitle: input.sourceId, authorizedAt: NOW, revokedAt: null, consent: input.consent, authorizedBy: input.authorizedBy });
      return { authorizedAt: NOW };
    },
    async revoke(_provider, groupId, at) {
      const i = records.findIndex((r) => r.groupId === groupId && !r.revokedAt);
      const record = records[i];
      if (!record) return false;
      records[i] = { ...record, revokedAt: at };
      return true;
    },
  };
  return { repo, records };
}

function memorySources(): ImportSourceRepository & { created: { conversationId: string; title: string }[] } {
  const created: { conversationId: string; title: string }[] = [];
  return {
    created,
    async ensurePendingAccount() {
      return { accountRowId: "acc-1", externalAccountId: "+5511988887777" };
    },
    async ensureAuthorizedSource(input) {
      created.push({ conversationId: input.conversationId, title: input.title });
      return { sourceId: `src-${input.conversationId}`, status: "authorized", created: true };
    },
  };
}

const group = (groupId: string, subject: string, extra: Partial<DirectoryGroup> = {}): DirectoryGroup => ({
  groupId,
  subject,
  participants: 5,
  seenAt: new Date("2026-11-23T17:00:00Z"),
  leftAt: null,
  ...extra,
});

function setup(groups = [group("200@g.us", "Família"), group("100@g.us", "Grupo de teste")], owned = {}) {
  const directory = memoryDirectory(groups);
  const captures = memoryCaptures(owned);
  const sources = memorySources();
  const admin = createCaptureAdmin({ directory, captures: captures.repo, sources, now: () => NOW });
  return { admin, directory, captures, sources };
}

describe("ordem e referência dos grupos", () => {
  it("ordena por nome e, em empate, pelo id", () => {
    const sorted = sortGroups([group("3@g.us", "b"), group("2@g.us", "a"), group("1@g.us", "a")]);
    expect(sorted.map((g) => g.groupId)).toEqual(["1@g.us", "2@g.us", "3@g.us"]);
  });

  it("aceita o número da listagem ou o id, com ou sem @g.us", () => {
    const sorted = sortGroups([group("120363000000000001@g.us", "a"), group("120363000000000002@g.us", "b")]);
    expect(resolveGroupRef(sorted, "2").groupId).toBe("120363000000000002@g.us");
    expect(resolveGroupRef(sorted, " 120363000000000001 ").groupId).toBe("120363000000000001@g.us");
    expect(resolveGroupRef(sorted, "120363000000000002@g.us").subject).toBe("b");
  });

  it("número fora da lista ou id desconhecido: erro com a dica da listagem", () => {
    const sorted = sortGroups([group("1@g.us", "a")]);
    expect(() => resolveGroupRef(sorted, "0")).toThrow(/whatsapp:grupos/);
    expect(() => resolveGroupRef(sorted, "2")).toThrow(/Grupo não encontrado/);
    expect(() => resolveGroupRef(sorted, "999999999999@g.us")).toThrow(/Grupo não encontrado/);
  });
});

describe("assertSameConversation", () => {
  it("sem --conversa ou com confirmação, não trava; nomes equivalentes passam", () => {
    expect(() => assertSameConversation({ position: 3, subject: "A" }, undefined, false)).not.toThrow();
    expect(() => assertSameConversation({ position: 3, subject: "A" }, "B", true)).not.toThrow();
    expect(() => assertSameConversation({ position: 3, subject: "Grupo  de Teste" }, "grupo de teste", false)).not.toThrow();
    expect(() => assertSameConversation({ position: 3, subject: "A" }, "B", false)).toThrow('O grupo 3 é "A", mas a conversa é "B".');
  });
});

describe("validateConsent", () => {
  it("exige de 10 a 500 caracteres, ignorando espaços nas pontas", () => {
    expect(validateConsent(`  ${CONSENT}  `)).toBe(CONSENT);
    expect(validateConsent("a".repeat(10))).toHaveLength(10);
    expect(validateConsent("a".repeat(500))).toHaveLength(500);
    expect(() => validateConsent(undefined)).toThrow(/--consentimento com 10 a 500/);
    expect(() => validateConsent("  curto   ")).toThrow(/--consentimento/);
    expect(() => validateConsent("a".repeat(501))).toThrow(/--consentimento/);
  });
});

describe("listagem", () => {
  it("todos começam não autorizados, com posição e data da última atualização", async () => {
    const { admin } = setup([group("1@g.us", "b", { seenAt: new Date("2026-11-23T16:00:00Z") }), group("2@g.us", "a")]);
    const listing = await admin.list();
    expect(listing.updatedAt).toEqual(new Date("2026-11-23T17:00:00Z"));
    expect(listing.groups.map((g) => [g.position, g.subject, g.status.kind])).toEqual([
      [1, "a", "not_authorized"],
      [2, "b", "not_authorized"],
    ]);
  });

  it("diretório vazio: sem data de atualização", async () => {
    expect(await setup([]).admin.list()).toEqual({ updatedAt: null, groups: [] });
  });
});

describe("autorizar", () => {
  it("sem --conversa cria fonte nova com o nome do grupo e registra o consentimento e o dono", async () => {
    const { admin, captures, sources } = setup();
    const result = await admin.authorize({ owner: OWNER, group: "2", consent: CONSENT });
    expect(result).toEqual({ subject: "Grupo de teste", sourceTitle: "Grupo de teste", linkedToImport: false, authorizedAt: NOW });
    expect(sources.created).toEqual([{ conversationId: "100@g.us", title: "Grupo de teste" }]);
    expect(captures.records[0]).toMatchObject({ groupId: "100@g.us", sourceId: "src-100@g.us", consent: CONSENT, authorizedBy: "u1" });
    expect((await admin.list()).groups[1]?.status).toEqual({ kind: "authorized", sourceTitle: "src-100@g.us", since: NOW });
  });

  it("com --conversa usa a fonte importada do dono (mesmo id da importação)", async () => {
    const { admin, captures, sources } = setup(undefined, { "u1|export:t3": { sourceId: "src-t3", title: "T3" } });
    const result = await admin.authorize({ owner: OWNER, group: "2", consent: CONSENT, conversation: "T3", confirmNameMismatch: true });
    expect(result).toMatchObject({ sourceTitle: "T3", linkedToImport: true });
    expect(captures.records[0]?.sourceId).toBe("src-t3");
    expect(sources.created).toEqual([]);
  });

  it("--conversa inexistente para o dono: recusa sem autorizar", async () => {
    const { admin, captures } = setup();
    await expect(admin.authorize({ owner: OWNER, group: "2", consent: CONSENT, conversation: "Outra", confirmNameMismatch: true })).rejects.toThrow(
      'Não há conversa importada com o nome "Outra" para este dono.',
    );
    expect(captures.records).toEqual([]);
  });

  it("nome do grupo diferente da conversa: recusa sem --confirmar, mostrando os dois nomes e o número", async () => {
    const { admin, captures } = setup(undefined, { "u1|export:casa-sinop": { sourceId: "src-casa", title: "Casa Sinop" } });
    await expect(admin.authorize({ owner: OWNER, group: "1", consent: CONSENT, conversation: "Casa Sinop" })).rejects.toMatchObject({
      code: "name_mismatch",
      message: expect.stringContaining('O grupo 1 é "Família", mas a conversa é "Casa Sinop"'),
    });
    await expect(admin.authorize({ owner: OWNER, group: "1", consent: CONSENT, conversation: "Casa Sinop" })).rejects.toThrow(/--confirmar/);
    expect(captures.records).toEqual([]);
  });

  it("mesmo nome com outra caixa, acentos ou pontuação dispensa a confirmação", async () => {
    const { admin, captures } = setup([group("1@g.us", "Casa sinop")], { "u1|export:casa-sinop": { sourceId: "src-casa", title: "Casa Sinop" } });
    await admin.authorize({ owner: OWNER, group: "1", consent: CONSENT, conversation: "Casa Sinóp!" });
    expect(captures.records[0]?.sourceId).toBe("src-casa");
  });

  it("sem consentimento: recusa antes de tocar em qualquer coisa", async () => {
    const { admin, captures, sources } = setup();
    await expect(admin.authorize({ owner: OWNER, group: "2", consent: "" })).rejects.toMatchObject({ code: "consent_invalid" });
    expect(captures.records).toEqual([]);
    expect(sources.created).toEqual([]);
  });

  it("grupo já autorizado: recusa e não cria segunda captura", async () => {
    const { admin, captures } = setup();
    await admin.authorize({ owner: OWNER, group: "2", consent: CONSENT });
    await expect(admin.authorize({ owner: OWNER, group: "2", consent: CONSENT })).rejects.toMatchObject({ code: "already_authorized" });
    expect(captures.records).toHaveLength(1);
  });

  it("grupo de que o número saiu: recusa", async () => {
    const { admin } = setup([group("1@g.us", "a", { leftAt: NOW })]);
    await expect(admin.authorize({ owner: OWNER, group: "1", consent: CONSENT })).rejects.toMatchObject({ code: "group_left" });
  });
});

describe("revogar e rotear", () => {
  it("revogar para o roteamento na hora; reautorizar volta a rotear", async () => {
    const { admin, captures } = setup();
    const route = createRouteGroup(captures.repo);
    await admin.authorize({ owner: OWNER, group: "2", consent: CONSENT });
    expect(await route("100@g.us")).toMatchObject({ sourceId: "src-100@g.us", authorizedAt: NOW });
    expect(await admin.revoke("2")).toEqual({ subject: "Grupo de teste" });
    expect(await route("100@g.us")).toBeNull();
    expect((await admin.list()).groups[1]?.status).toEqual({ kind: "revoked", at: NOW });
    await admin.authorize({ owner: OWNER, group: "2", consent: CONSENT });
    expect(await route("100@g.us")).not.toBeNull();
    expect(captures.records).toHaveLength(2);
  });

  it("revogar grupo não autorizado: erro", async () => {
    await expect(setup().admin.revoke("1")).rejects.toMatchObject({ code: "not_authorized", message: "O grupo não está autorizado." });
  });

  it("grupo sem captura não tem rota", async () => {
    expect(await createRouteGroup(setup().captures.repo)("999@g.us")).toBeNull();
  });
});

describe("diretório de grupos", () => {
  it("lista completa atualiza e marca como saído o grupo que sumiu; lista parcial só atualiza", async () => {
    const directory = memoryDirectory([group("1@g.us", "a"), group("2@g.us", "b")]);
    const sync = createSyncGroupDirectory(directory, () => NOW);
    await sync([{ groupId: "3@g.us", subject: "c", participants: 2 }], false);
    expect(directory.rows.map((r) => [r.groupId, r.leftAt])).toEqual([
      ["1@g.us", null],
      ["2@g.us", null],
      ["3@g.us", null],
    ]);
    await sync([{ groupId: "1@g.us", subject: "a2", participants: 6 }], true);
    expect(directory.rows.map((r) => [r.groupId, r.subject, r.leftAt])).toEqual([
      ["1@g.us", "a2", null],
      ["2@g.us", "b", NOW],
      ["3@g.us", "c", NOW],
    ]);
  });
});
