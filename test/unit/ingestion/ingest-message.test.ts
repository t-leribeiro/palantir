// T025: regras RN-01, RN-02, RN-03 e RF-10 da feature 001.
import { describe, expect, it } from "vitest";
import {
  createIngestMessage,
  type IndexJob,
  type IngestionTx,
  type NewMessage,
  type ReconcileDirection,
  type SourceAuthorization,
  type SourceCheck,
} from "../../../src/modules/ingestion/index.js";
import { canonicalMessage } from "../../support/messages.js";

const AUTHORIZED: SourceCheck = { status: "authorized", sourceId: "src-1", spaceId: "space-1" };

function memoryStore() {
  const messages: NewMessage[] = [];
  const jobs: IndexJob[] = [];
  const candidateQueries: { sourceId: string; direction: ReconcileDirection; from: Date; to: Date }[] = [];
  const attached: { id: string; captureMethod: string; direction: ReconcileDirection }[] = [];
  const keyOf = (m: NewMessage) => (m.importKey && !m.externalMessageId ? { importKey: m.importKey } : { externalMessageId: m.externalMessageId });
  let committed = 0;
  let failNextEnqueue = false;
  const tx: IngestionTx = {
    messages: {
      async insert(m) {
        const key = keyOf(m);
        const dup = messages.find(
          (x) => x.sourceId === m.sourceId && (key.importKey ? x.importKey === key.importKey : x.externalMessageId === key.externalMessageId),
        );
        if ((key.importKey || key.externalMessageId) && dup) return { status: "duplicate", id: dup.id };
        messages.push(m);
        return { status: "inserted", id: m.id };
      },
      async findByKey(m) {
        const key = keyOf(m);
        const found = messages.find(
          (x) => x.sourceId === m.sourceId && (key.importKey ? x.importKey === key.importKey : x.externalMessageId === key.externalMessageId),
        );
        return found?.id;
      },
      async reconcileCandidates(query) {
        candidateQueries.push(query);
        const missing = query.direction === "import_to_live" ? "importKey" : "externalMessageId";
        const present = query.direction === "import_to_live" ? "externalMessageId" : "importKey";
        return messages
          .filter((x) => x.sourceId === query.sourceId && !x[missing] && x[present] && x.text)
          .filter((x) => x.sentAt >= query.from && x.sentAt <= query.to)
          .map((x) => ({ id: x.id, sentAt: x.sentAt, text: x.text ?? "", authorName: x.sender.displayName }));
      },
      async attachReconciled(id, m, direction) {
        const i = messages.findIndex((x) => x.id === id);
        const current = messages[i];
        if (!current) throw new Error("mensagem inexistente");
        messages[i] = direction === "import_to_live" ? { ...current, importKey: m.importKey } : { ...current, externalMessageId: m.externalMessageId };
        attached.push({ id, captureMethod: m.provenance.captureMethod, direction });
      },
    },
    jobs: {
      async enqueueIndex(job) {
        if (failNextEnqueue) {
          failNextEnqueue = false;
          throw new Error("fila indisponível");
        }
        jobs.push(job);
      },
    },
  };
  return {
    messages,
    jobs,
    candidateQueries,
    attached,
    get committed() {
      return committed;
    },
    failEnqueueOnce() {
      failNextEnqueue = true;
    },
    unitOfWork: {
      // Simula transação: em erro, desfaz o que foi gravado dentro dela.
      async run<T>(fn: (t: IngestionTx) => Promise<T>): Promise<T> {
        const before = { m: messages.length, j: jobs.length };
        try {
          const result = await fn(tx);
          committed += 1;
          return result;
        } catch (e) {
          messages.length = before.m;
          jobs.length = before.j;
          throw e;
        }
      },
    },
  };
}

function setup(check: SourceCheck = AUTHORIZED) {
  const store = memoryStore();
  const calls: Parameters<SourceAuthorization["check"]>[0][] = [];
  let n = 0;
  const ingest = createIngestMessage({
    sources: {
      async check(ref) {
        calls.push(ref);
        return check;
      },
    },
    unitOfWork: store.unitOfWork,
    ids: () => `msg-${++n}`,
  });
  return { ingest, store, calls };
}

describe("ingestão de mensagens", () => {
  it("grava mensagem de fonte autorizada e enfileira a indexação na mesma transação", async () => {
    const { ingest, store } = setup();
    const outcome = await ingest(canonicalMessage());
    expect(outcome).toEqual({ outcome: "accepted", messageId: "msg-1" });
    expect(store.messages).toHaveLength(1);
    expect(store.jobs).toEqual([{ messageId: "msg-1", spaceId: "space-1", reason: "ingested" }]);
    expect(store.committed).toBe(1);
  });

  it("consulta a autorização pela fonte de origem", async () => {
    const { ingest, calls } = setup();
    await ingest(canonicalMessage());
    expect(calls).toEqual([{ provider: "fake", accountId: "fake-operator", conversationId: "fake-group-1" }]);
  });

  it("preserva autor, conteúdo, data e proveniência na mensagem gravada", async () => {
    const { ingest, store } = setup();
    await ingest(canonicalMessage());
    expect(store.messages[0]).toEqual({
      id: "msg-1",
      spaceId: "space-1",
      sourceId: "src-1",
      externalMessageId: "m-1",
      importKey: undefined,
      sender: { externalId: "ana", displayName: "Ana" },
      kind: "text",
      text: "O Grafana Alloy centraliza a coleta de telemetria",
      sentAt: new Date("2026-11-22T13:00:00.000Z"),
      isForwarded: false,
      quotedExternalMessageId: undefined,
      provenance: { captureMethod: "live", adapter: "fake", capturedAt: new Date("2026-11-22T13:00:01.000Z") },
    });
  });

  it("grava a mesma mensagem uma única vez, mesmo entregue 3 vezes", async () => {
    const { ingest, store } = setup();
    const first = await ingest(canonicalMessage());
    const second = await ingest(canonicalMessage());
    const third = await ingest(canonicalMessage());
    expect(first.outcome).toBe("accepted");
    expect(second).toEqual({ outcome: "duplicate", messageId: "msg-1" });
    expect(third).toEqual({ outcome: "duplicate", messageId: "msg-1" });
    expect(store.messages).toHaveLength(1);
    expect(store.jobs).toHaveLength(1);
  });

  it("rejeita mensagem de fonte não autorizada sem gravar nada", async () => {
    const { ingest, store } = setup({ status: "not_authorized" });
    expect(await ingest(canonicalMessage())).toEqual({ outcome: "rejected", reason: "not_authorized" });
    expect(store.messages).toHaveLength(0);
    expect(store.jobs).toHaveLength(0);
    expect(store.committed).toBe(0);
  });

  it("rejeita mensagem de fonte em exclusão", async () => {
    const { ingest, store } = setup({ status: "source_deleting" });
    expect(await ingest(canonicalMessage())).toEqual({ outcome: "rejected", reason: "source_deleting" });
    expect(store.messages).toHaveLength(0);
  });

  it("não grava a mensagem se o enfileiramento falhar (atomicidade)", async () => {
    const { ingest, store } = setup();
    store.failEnqueueOnce();
    await expect(ingest(canonicalMessage())).rejects.toThrow("fila indisponível");
    expect(store.messages).toHaveLength(0);
    expect(await ingest(canonicalMessage())).toMatchObject({ outcome: "accepted" });
  });

  it("leva a chave de importação para a mensagem gravada (contrato 1.1.0)", async () => {
    const { ingest, store } = setup();
    const key = "b".repeat(64);
    await ingest(
      canonicalMessage({
        source: { provider: "whatsapp", accountId: "unlinked:u1", conversationId: "export:devops", importKey: key },
        provenance: { captureMethod: "export_import", capturedAt: "2026-11-23T10:00:00Z", adapter: "whatsapp-export" },
      }),
    );
    expect(store.messages[0]).toMatchObject({ importKey: key, externalMessageId: undefined });
    expect(store.messages[0]?.provenance.captureMethod).toBe("export_import");
  });

  it("aceita mensagens distintas da mesma fonte", async () => {
    const { ingest, store } = setup();
    await ingest(canonicalMessage());
    await ingest(canonicalMessage({ source: { ...canonicalMessage().source, externalMessageId: "m-2" } }));
    expect(store.messages.map((m) => m.externalMessageId)).toEqual(["m-1", "m-2"]);
  });
});

describe("reconciliação ao vivo × importada (feature 004, D-09)", () => {
  const KEY = "c".repeat(64);
  const live = (text: string, timestamp: string, externalMessageId = "LIVE-1", displayName = "Ana Souza") =>
    canonicalMessage({
      source: { provider: "whatsapp", accountId: "+5511988887777", conversationId: "export:t3", externalMessageId },
      sender: { externalId: "+5511988887777", displayName },
      timestamp,
      text,
    });
  const imported = (text: string, timestamp: string, importKey = KEY, displayName = "Ana") =>
    canonicalMessage({
      source: { provider: "whatsapp", accountId: "+5511988887777", conversationId: "export:t3", importKey },
      sender: { externalId: displayName.toLowerCase(), displayName },
      timestamp,
      text,
      provenance: { captureMethod: "export_import", capturedAt: "2026-11-23T18:00:00Z", adapter: "whatsapp-export" },
    });

  it("importada casa com a ao vivo: devolve a existente, grava a chave e não gera novo job", async () => {
    const { ingest, store } = setup();
    await ingest(live("Recomendo o Tempo", "2026-11-23T14:00:42Z"));
    const outcome = await ingest(imported("recomendo  o tempo", "2026-11-23T14:00:00Z"));
    expect(outcome).toEqual({ outcome: "reconciled", messageId: "msg-1" });
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toMatchObject({ importKey: KEY, externalMessageId: "LIVE-1", text: "Recomendo o Tempo" });
    expect(store.jobs).toHaveLength(1);
    expect(store.attached).toEqual([{ id: "msg-1", captureMethod: "export_import", direction: "import_to_live" }]);
  });

  it("consulta candidatas na janela de 60 s em volta do horário, no sentido certo", async () => {
    const { ingest, store } = setup();
    await ingest(imported("deploy", "2026-11-23T14:00:00Z"));
    expect(store.candidateQueries).toEqual([
      { sourceId: "src-1", direction: "import_to_live", from: new Date("2026-11-23T13:59:00Z"), to: new Date("2026-11-23T14:01:00Z") },
    ]);
  });

  it("ao vivo casa com a importada e grava o id do WhatsApp nela", async () => {
    const { ingest, store } = setup();
    await ingest(imported("deploy às 18h", "2026-11-23T14:00:00Z"));
    expect(await ingest(live("Deploy às 18h", "2026-11-23T14:00:30Z", "LIVE-9"))).toEqual({ outcome: "reconciled", messageId: "msg-1" });
    expect(store.messages[0]).toMatchObject({ importKey: KEY, externalMessageId: "LIVE-9" });
  });

  it("reimportação de mensagem já reconciliada é duplicata, sem procurar candidatas", async () => {
    const { ingest, store } = setup();
    await ingest(live("ok", "2026-11-23T14:00:10Z"));
    await ingest(imported("ok", "2026-11-23T14:00:00Z"));
    const queries = store.candidateQueries.length;
    expect(await ingest(imported("ok", "2026-11-23T14:00:00Z"))).toEqual({ outcome: "duplicate", messageId: "msg-1" });
    expect(store.candidateQueries).toHaveLength(queries);
  });

  it("texto diferente não reconcilia e vira mensagem nova", async () => {
    const { ingest, store } = setup();
    await ingest(live("vamos usar Kafka", "2026-11-23T14:00:10Z"));
    expect(await ingest(imported("vamos usar Redis", "2026-11-23T14:00:00Z"))).toEqual({ outcome: "accepted", messageId: "msg-2" });
    expect(store.messages).toHaveLength(2);
  });

  it("entre duas iguais à mesma distância, o nome do autor desempata", async () => {
    const { ingest } = setup();
    await ingest(live("ok", "2026-11-23T14:00:20Z", "L-1", "Bruno"));
    await ingest(live("ok", "2026-11-23T13:59:40Z", "L-2", "Ana"));
    expect(await ingest(imported("ok", "2026-11-23T14:00:00Z", KEY, "Ana"))).toEqual({ outcome: "reconciled", messageId: "msg-2" });
  });

  it("mensagem sem texto ou com as duas chaves não tenta reconciliar", async () => {
    const { ingest, store } = setup();
    const { externalMessageId: _omit, ...withoutId } = canonicalMessage().source;
    const { text: _noText, ...audio } = canonicalMessage({ kind: "audio" });
    await ingest({ ...audio, source: { ...withoutId, importKey: KEY } });
    await ingest(canonicalMessage({ source: { ...canonicalMessage().source, importKey: KEY, externalMessageId: "X" } }));
    expect(store.candidateQueries).toHaveLength(0);
  });
});
