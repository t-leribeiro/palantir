// T011 (feature 005, interfaces/job-media-process.md, D-12, D-13): processar o anexo com o motor falso.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  AttachmentForProcessing,
  MediaTx,
  MediaUnitOfWork,
  ObjectStore,
  ProcessingError,
  ProcessingStatus,
  ProcessorResult,
} from "../../../src/modules/media/application/ports.js";
import {
  createAudioProcessor,
  createProcessAttachment,
  type MediaObserver,
} from "../../../src/modules/media/application/process-attachment.js";
import { createFakeTranscriber } from "../../../src/modules/media/infrastructure/transcribers/fake.js";
import { saying, syntheticOpus } from "../../support/audio.js";

function setup(bytes: Uint8Array, overrides: Partial<AttachmentForProcessing> = {}, transcriber = createFakeTranscriber()) {
  const sha = createHash("sha256").update(bytes).digest("hex");
  let attachment: AttachmentForProcessing = {
    id: "att-1",
    messageId: "msg-1",
    spaceId: "space-1",
    mediaKind: "audio",
    mimeType: "audio/ogg",
    sha256: sha,
    storageKey: `space-1/src-1/${sha}`,
    durationSeconds: 10,
    processingStatus: "pending",
    createdAt: new Date("2026-11-23T10:00:00Z"),
    ...overrides,
  };
  const saved: ProcessorResult[] = [];
  const statuses: { status: ProcessingStatus; error: ProcessingError | undefined }[] = [];
  const indexJobs: { messageId: string; spaceId: string }[] = [];
  const observed: string[] = [];
  const tx: MediaTx = {
    lockAttachment: async () => attachment,
    async saveTranscript(_a, result) {
      saved.push(result);
    },
    async markStatus(_id, status, error) {
      statuses.push({ status, error });
      attachment = { ...attachment, processingStatus: status };
    },
    async enqueueIndex(job) {
      indexJobs.push(job);
    },
  };
  const unitOfWork: MediaUnitOfWork = { load: async (id) => (id === attachment.id ? attachment : null), run: (work) => work(tx) };
  const store: ObjectStore = {
    ensureBucket: async () => undefined,
    putIfAbsent: async () => ({ created: true }),
    get: async () => bytes,
    exists: async () => true,
  };
  const observer: MediaObserver = {
    processed: (kind, outcome, details) => observed.push(`${kind}:${outcome}${details?.reason ? `:${details.reason}` : ""}`),
    transcribed: ({ model, latencySeconds }) => observed.push(`transcribed:${model}:${latencySeconds}`),
  };
  const run = createProcessAttachment({
    unitOfWork,
    store,
    processors: [createAudioProcessor(transcriber)],
    observer,
    now: () => new Date("2026-11-23T10:00:30Z"),
  });
  return { run, saved, statuses, indexJobs, observed };
}

const job = { attachmentId: "att-1", spaceId: "space-1" };

describe("processAttachment", () => {
  it("transcreve, grava a versão ativa, marca done e publica a indexação; observa sem texto", async () => {
    const s = setup(syntheticOpus(saying("hoje falamos de Kubernetes", 10)));
    expect(await s.run(job, { lastAttempt: false })).toBe("done");
    expect(s.saved[0]).toMatchObject({ status: "done", transcript: { engine: "fake", segments: [{ start: 0, end: 10, text: "hoje falamos de Kubernetes" }] } });
    expect(s.statuses).toEqual([{ status: "done", error: undefined }]);
    expect(s.indexJobs).toEqual([{ messageId: "msg-1", spaceId: "space-1" }]);
    expect(s.observed).toEqual(["audio:done", "transcribed:fake-whisper:30"]);
  });

  it("sem fala: empty, sem indexação", async () => {
    const s = setup(syntheticOpus({ seconds: 4 }));
    expect(await s.run(job, { lastAttempt: false })).toBe("empty");
    expect(s.indexJobs).toEqual([]);
  });

  it("acima de 60 min: too_long sem chamar o motor", async () => {
    const s = setup(syntheticOpus({ seconds: 5 }), { durationSeconds: 3601 });
    expect(await s.run(job, { lastAttempt: false })).toBe("too_long");
    expect(s.saved).toEqual([]);
    expect(s.observed).toEqual(["audio:too_long"]);
  });

  it("arquivo que não decodifica: failed/corrupted sem nova tentativa", async () => {
    const s = setup(new Uint8Array(80).fill(3));
    expect(await s.run(job, { lastAttempt: false })).toBe("failed");
    expect(s.statuses).toEqual([{ status: "failed", error: "corrupted" }]);
    expect(s.observed).toEqual(["audio:failed:corrupted"]);
  });

  it("hash diferente do registrado: failed/corrupted", async () => {
    const s = setup(syntheticOpus({ seconds: 2 }), { sha256: "0".repeat(64) });
    expect(await s.run(job, { lastAttempt: false })).toBe("failed");
    expect(s.statuses).toEqual([{ status: "failed", error: "corrupted" }]);
  });

  it("falha transitória do motor: relança para o pg-boss tentar de novo; na última tentativa grava failed", async () => {
    const bytes = syntheticOpus(saying("x", 2));
    const first = setup(bytes, {}, createFakeTranscriber({ failTimes: 5 }));
    await expect(first.run(job, { lastAttempt: false })).rejects.toMatchObject({ kind: "engine_failed" });
    expect(first.statuses).toEqual([]);
    const last = setup(bytes, {}, createFakeTranscriber({ failTimes: 5 }));
    expect(await last.run(job, { lastAttempt: true })).toBe("failed");
    expect(last.statuses).toEqual([{ status: "failed", error: "engine_failed" }]);
  });

  it("idempotente: anexo já processado, de outro espaço ou inexistente é ignorado", async () => {
    const bytes = syntheticOpus(saying("x", 2));
    expect(await setup(bytes, { processingStatus: "done" }).run(job, { lastAttempt: false })).toBe("skipped");
    expect(await setup(bytes).run({ ...job, spaceId: "outro" }, { lastAttempt: false })).toBe("skipped");
    expect(await setup(bytes).run({ ...job, attachmentId: "nada" }, { lastAttempt: false })).toBe("skipped");
  });

  it("tipo sem processador vira not_applicable", async () => {
    const s = setup(new Uint8Array([1]), { mediaKind: "image" });
    expect(await s.run(job, { lastAttempt: false })).toBe("skipped");
    expect(s.statuses).toEqual([{ status: "not_applicable", error: undefined }]);
  });

  it("concorrência: se outro job já processou enquanto este transcrevia, não grava de novo", async () => {
    // Simula a corrida: o lock na transação vê o anexo já concluído.
    const raced = createProcessAttachment({
      unitOfWork: {
        load: async () => ({
          id: "att-1", messageId: "msg-1", spaceId: "space-1", mediaKind: "audio", mimeType: "audio/ogg", sha256: null,
          storageKey: "k", durationSeconds: 2, processingStatus: "pending", createdAt: null,
        }),
        run: (work) =>
          work({
            lockAttachment: async () => ({
              id: "att-1", messageId: "msg-1", spaceId: "space-1", mediaKind: "audio", mimeType: "audio/ogg", sha256: null,
              storageKey: "k", durationSeconds: 2, processingStatus: "done", createdAt: null,
            }),
            saveTranscript: async () => {
              throw new Error("não deveria gravar");
            },
            markStatus: async () => undefined,
            enqueueIndex: async () => undefined,
          }),
      },
      store: { ensureBucket: async () => undefined, putIfAbsent: async () => ({ created: true }), get: async () => syntheticOpus(saying("x", 2)), exists: async () => true },
      processors: [createAudioProcessor(createFakeTranscriber())],
    });
    expect(await raced(job, { lastAttempt: false })).toBe("skipped");
  });
});

describe("processador de áudio", () => {
  it("mede o fator de tempo real pela duração do motor", async () => {
    let t = 0;
    const processor = createAudioProcessor(createFakeTranscriber(), () => (t += 2500));
    const attachment = { id: "a", messageId: "m", spaceId: "s", mediaKind: "audio" as const, mimeType: "audio/ogg", sha256: null, storageKey: "k", durationSeconds: null, processingStatus: "pending" as const, createdAt: null };
    const result = await processor.process(attachment, syntheticOpus(saying("y", 10)));
    expect(result.transcript.rtf).toBeCloseTo(0.25, 5);
    expect(result.status).toBe("done");
  });
});
