// T009 (feature 005, RF-03, RF-04, RN-01, D-02, D-03): preparar anexos antes de ingerir.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MediaUnavailableError, type CanonicalMessage, type MediaContent } from "../../../src/contracts/channel/knowledge-channel.js";
import type { ObjectStore } from "../../../src/modules/media/application/ports.js";
import { createPrepareAttachments, type MediaFetch } from "../../../src/modules/media/application/prepare-attachments.js";
import { syntheticOpus } from "../../support/audio.js";
import { canonicalMessage, withoutText } from "../../support/messages.js";

function memoryStore() {
  const objects = new Map<string, Uint8Array>();
  const store: ObjectStore = {
    ensureBucket: async () => undefined,
    async putIfAbsent(key, bytes) {
      if (objects.has(key)) return { created: false };
      objects.set(key, bytes);
      return { created: true };
    },
    get: async (key) => objects.get(key) ?? new Uint8Array(),
    exists: async (key) => objects.has(key),
    deletePrefix: async () => 0,
  };
  return { store, objects };
}

const authorized = { check: async () => ({ status: "authorized" as const, sourceId: "src-1", spaceId: "space-1" }) };
const denied = { check: async () => ({ status: "not_authorized" as const }) };

type Attachment = CanonicalMessage["attachments"][number];

function audioMessage(attachment: Partial<Attachment> = {}, base: Attachment = { id: "a1", mimeType: "audio/ogg; codecs=opus", fetchRef: "ref-1" }): CanonicalMessage {
  return withoutText(canonicalMessage({ contractVersion: "1.3.0", kind: "audio", attachments: [{ ...base, ...attachment }] }));
}

const okFetch = (bytes: Uint8Array): MediaFetch => async () => ({ bytes, mimeType: "audio/ogg" });

function setup(overrides: { storeKinds?: string[]; sources?: typeof authorized | typeof denied } = {}) {
  const memory = memoryStore();
  const waits: number[] = [];
  const prepare = createPrepareAttachments({
    sources: overrides.sources ?? authorized,
    store: memory.store,
    storeKinds: overrides.storeKinds ?? ["audio"],
    sleep: async (ms) => {
      waits.push(ms);
    },
  });
  return { ...memory, waits, prepare };
}

describe("prepareAttachments", () => {
  it("guarda o áudio pelo conteúdo e preenche status, chave, hash, tamanho e duração do Ogg", async () => {
    const { prepare, objects } = setup();
    const bytes = syntheticOpus({ seconds: 42 });
    const out = await prepare(audioMessage({ durationSeconds: 40 }), okFetch(bytes));
    const sha = createHash("sha256").update(bytes).digest("hex");
    expect(out.attachments).toEqual([
      { id: "a1", mimeType: "audio/ogg; codecs=opus", sizeBytes: bytes.length, status: "stored", storageKey: `space-1/src-1/${sha}`, sha256: sha, durationSeconds: 42 },
    ]);
    expect([...objects.keys()]).toEqual([`space-1/src-1/${sha}`]);
  });

  it("RN-01: fonte não autorizada não baixa nada e devolve a mensagem como veio", async () => {
    const { prepare } = setup({ sources: denied });
    let fetched = 0;
    const message = audioMessage();
    const out = await prepare(message, async () => {
      fetched += 1;
      return { bytes: new Uint8Array(), mimeType: "audio/ogg" };
    });
    expect(fetched).toBe(0);
    expect(out).toBe(message);
  });

  it("tipo fora da política fica unavailable/unsupported sem baixar", async () => {
    const { prepare } = setup({ storeKinds: [] });
    let fetched = 0;
    const out = await prepare(audioMessage(), async () => {
      fetched += 1;
      return { bytes: new Uint8Array(), mimeType: "audio/ogg" };
    });
    expect(fetched).toBe(0);
    expect(out.attachments[0]).toEqual({ id: "a1", mimeType: "audio/ogg; codecs=opus", status: "unavailable", unavailableReason: "unsupported" });
  });

  it("falha transitória: tenta de novo com 1, 2 e 4 s e guarda quando consegue", async () => {
    const { prepare, waits } = setup();
    let calls = 0;
    const flaky: MediaFetch = async (): Promise<MediaContent> => {
      calls += 1;
      if (calls < 3) throw new MediaUnavailableError("download_failed");
      return { bytes: syntheticOpus({ seconds: 2 }), mimeType: "audio/ogg" };
    };
    expect((await prepare(audioMessage(), flaky)).attachments[0]?.status).toBe("stored");
    expect(waits).toEqual([1000, 2000]);
  });

  it("falha definitiva depois das novas tentativas: unavailable/download_failed, sem perder a mensagem", async () => {
    const { prepare, waits } = setup();
    const out = await prepare(audioMessage(), async () => {
      throw new Error("rede");
    });
    expect(waits).toEqual([1000, 2000, 4000]);
    expect(out.attachments[0]).toMatchObject({ status: "unavailable", unavailableReason: "download_failed" });
    expect(out.source).toEqual(audioMessage().source);
  });

  it("referência expirada não tenta de novo", async () => {
    const { prepare, waits } = setup();
    const out = await prepare(audioMessage(), async () => {
      throw new MediaUnavailableError("expired");
    });
    expect(waits).toEqual([]);
    expect(out.attachments[0]).toMatchObject({ status: "unavailable", unavailableReason: "expired" });
  });

  it("acima de 64 MB fica too_large sem gravar", async () => {
    const { prepare, objects } = setup();
    const out = await prepare(audioMessage(), okFetch(new Uint8Array(64 * 1024 * 1024 + 1)));
    expect(out.attachments[0]).toMatchObject({ status: "unavailable", unavailableReason: "too_large" });
    expect(objects.size).toBe(0);
  });

  it("Ogg inválido é guardado com a duração informada (o processador marca corrompido depois)", async () => {
    const { prepare } = setup();
    const out = await prepare(audioMessage({ durationSeconds: 7 }), okFetch(new Uint8Array(100).fill(1)));
    expect(out.attachments[0]).toMatchObject({ status: "stored", durationSeconds: 7 });
  });

  it("áudio não Ogg (m4a) fica com a duração informada pelo canal, ou sem duração", async () => {
    const { prepare } = setup();
    const m4a: MediaFetch = async () => ({ bytes: new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), mimeType: "audio/mp4" });
    const withHint = await prepare(audioMessage({ mimeType: "audio/mp4", durationSeconds: 15 }), m4a);
    expect(withHint.attachments[0]).toMatchObject({ status: "stored", durationSeconds: 15 });
    const noHint = await prepare(audioMessage({ mimeType: "audio/mp4" }), m4a);
    expect(noHint.attachments[0]).not.toHaveProperty("durationSeconds");
  });

  it("mensagem sem anexo pendente passa direto, sem consultar a fonte", async () => {
    let checks = 0;
    const prepare = createPrepareAttachments({
      sources: { check: async () => (checks++, { status: "authorized", sourceId: "s", spaceId: "e" }) },
      store: memoryStore().store,
      storeKinds: ["audio"],
    });
    const text = canonicalMessage();
    expect(await prepare(text, okFetch(new Uint8Array()))).toBe(text);
    const agentAudio = audioMessage({}, { id: "a1", mimeType: "audio/ogg" });
    expect(await prepare(agentAudio, okFetch(new Uint8Array()))).toBe(agentAudio);
    expect(checks).toBe(0);
  });
});
