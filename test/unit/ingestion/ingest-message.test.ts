// T025: regras RN-01, RN-02, RN-03 e RF-10 da feature 001.
import { describe, expect, it } from "vitest";
import {
  createIngestMessage,
  type IndexJob,
  type IngestionTx,
  type NewMessage,
  type SourceAuthorization,
  type SourceCheck,
} from "../../../src/modules/ingestion/index.js";
import { canonicalMessage } from "../../support/messages.js";

const AUTHORIZED: SourceCheck = { status: "authorized", sourceId: "src-1", spaceId: "space-1" };

function memoryStore() {
  const messages: NewMessage[] = [];
  const jobs: IndexJob[] = [];
  let committed = 0;
  let failNextEnqueue = false;
  const tx: IngestionTx = {
    messages: {
      async insert(m) {
        const dup = messages.find((x) => x.sourceId === m.sourceId && x.externalMessageId === m.externalMessageId);
        if (m.externalMessageId && dup) return { status: "duplicate", id: dup.id };
        messages.push(m);
        return { status: "inserted", id: m.id };
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

  it("aceita mensagens distintas da mesma fonte", async () => {
    const { ingest, store } = setup();
    await ingest(canonicalMessage());
    await ingest(canonicalMessage({ source: { ...canonicalMessage().source, externalMessageId: "m-2" } }));
    expect(store.messages.map((m) => m.externalMessageId)).toEqual(["m-1", "m-2"]);
  });
});
