// T006 (feature 005): domínio de media (D-02, D-11, D-19) e formato do tempo (RN-05).
import { describe, expect, it } from "vitest";
import {
  InvalidOggError,
  looksLikeOgg,
  oggOpusDuration,
} from "../../../src/modules/media/domain/ogg-duration.js";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_AUDIO_SECONDS,
  createMediaPolicy,
  isOggMime,
  mediaKindOfFileName,
  mediaKindOfMime,
  mimeOfFileName,
} from "../../../src/modules/media/domain/media-policy.js";
import { aggregateWer, normalizeForWer, werCount } from "../../../src/modules/media/domain/wer.js";
import { formatClock } from "../../../src/shared/index.js";
import { syntheticOpus } from "../../support/audio.js";

describe("oggOpusDuration (D-11)", () => {
  it("lê a duração pela última página menos o pre-skip", () => {
    expect(oggOpusDuration(syntheticOpus({ seconds: 102.4 }))).toBeCloseTo(102.4, 3);
    expect(oggOpusDuration(syntheticOpus({ seconds: 3, preSkip: 0 }))).toBe(3);
    expect(oggOpusDuration(syntheticOpus({ seconds: 5400 }))).toBe(5400);
  });

  it("o roteiro grande no OpusTags (mais de 255 bytes) não atrapalha a leitura", () => {
    const script = Array.from({ length: 30 }, (_, i) => ({ start: i, end: i + 1, text: `frase número ${i} com várias palavras` }));
    expect(oggOpusDuration(syntheticOpus({ seconds: 30, script }))).toBe(30);
  });

  it("recusa o que não é Ogg, Ogg truncado e Ogg sem OpusHead", () => {
    expect(() => oggOpusDuration(new Uint8Array(100).fill(7))).toThrow(InvalidOggError);
    const ok = syntheticOpus({ seconds: 10 });
    expect(() => oggOpusDuration(ok.subarray(0, ok.length - 10))).toThrow(/truncada/);
    const noHead = Uint8Array.from(ok);
    noHead.set([0x58, 0x58, 0x58, 0x58], 28);
    expect(() => oggOpusDuration(noHead)).toThrow(/cabeçalho Opus/);
    const brokenCapture = Uint8Array.from(ok);
    brokenCapture[47] = 0x41; // a 2ª página começa logo depois da 1ª (27 + 1 + 19 bytes)
    expect(() => oggOpusDuration(brokenCapture)).toThrow(/corrompida/);
  });

  it("granulo menor que o pre-skip é inválido", () => {
    expect(() => oggOpusDuration(syntheticOpus({ seconds: 0, preSkip: 312 }))).not.toThrow();
    const bytes = syntheticOpus({ seconds: 0, preSkip: 312 });
    const last = bytes.length - 40 - 28; // início da última página
    new DataView(bytes.buffer).setBigUint64(last + 6, 10n, true);
    expect(() => oggOpusDuration(bytes)).toThrow(/granulo/);
  });

  it("looksLikeOgg olha só a captura inicial", () => {
    expect(looksLikeOgg(syntheticOpus({ seconds: 1 }))).toBe(true);
    expect(looksLikeOgg(new Uint8Array([0x4f, 0x67, 0x67]))).toBe(false);
  });
});

describe("política de mídia (RN-10, D-02)", () => {
  it("tipo pelo MIME", () => {
    expect(mediaKindOfMime("audio/ogg; codecs=opus")).toBe("audio");
    expect(mediaKindOfMime("image/jpeg")).toBe("image");
    expect(mediaKindOfMime("video/mp4")).toBe("video");
    expect(mediaKindOfMime("application/pdf")).toBe("document");
    expect(mediaKindOfMime("text/vcard")).toBe("document");
    expect(mediaKindOfMime("x/y")).toBe("other");
  });

  it("tipo e MIME pelo nome de referência do export", () => {
    expect(mediaKindOfFileName("PTT-20251101-WA0003.opus")).toBe("audio");
    expect(mediaKindOfFileName("00000012-AUDIO-2026-11-01-10-00-00.m4a")).toBe("audio");
    for (const ext of ["ogg", "oga", "mp3", "aac", "amr", "wav"]) expect(mediaKindOfFileName(`a.${ext}`)).toBe("audio");
    expect(mediaKindOfFileName("IMG-1.JPG")).toBe("image");
    expect(mediaKindOfFileName("VID-1.mp4")).toBe("video");
    expect(mediaKindOfFileName("boleto.pdf")).toBe("document");
    expect(mediaKindOfFileName("sem-extensao")).toBe("other");
    expect(mimeOfFileName("PTT-1.opus")).toBe("audio/ogg; codecs=opus");
    expect(mimeOfFileName("a.m4a")).toBe("audio/mp4");
    expect(mimeOfFileName("a.pdf")).toBe("application/octet-stream");
  });

  it("guarda só os tipos configurados", () => {
    const policy = createMediaPolicy(["audio"]);
    expect(policy.stores("audio")).toBe(true);
    expect(policy.stores("image")).toBe(false);
    expect(createMediaPolicy([]).stores("audio")).toBe(false);
  });

  it("limites: 64 MB por anexo e 60 min de áudio", () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(67_108_864);
    expect(MAX_AUDIO_SECONDS).toBe(3600);
  });

  it("isOggMime", () => {
    expect(isOggMime("audio/ogg; codecs=opus")).toBe(true);
    expect(isOggMime(" Audio/OGG")).toBe(true);
    expect(isOggMime("audio/mp4")).toBe(false);
  });
});

describe("WER (RF-11, D-19)", () => {
  it("normaliza acentos compostos, caixa e pontuação; ignora [?]", () => {
    expect(normalizeForWer("Olá, Mundo! [?] é isso.")).toEqual(["olá", "mundo", "é", "isso"]);
  });

  it("conta substituição, inserção e remoção", () => {
    expect(werCount("o gato subiu no telhado", "o gato subiu no telhado")).toEqual({ errors: 0, words: 5 });
    expect(werCount("o gato subiu no telhado", "o rato subiu no telhado")).toEqual({ errors: 1, words: 5 });
    expect(werCount("o gato subiu", "o gato subiu rápido")).toEqual({ errors: 1, words: 3 });
    expect(werCount("o gato subiu", "gato")).toEqual({ errors: 2, words: 3 });
    expect(werCount("", "qualquer coisa")).toEqual({ errors: 2, words: 0 });
  });

  it("agrega somando erros e palavras", () => {
    expect(aggregateWer([{ errors: 1, words: 10 }, { errors: 3, words: 10 }])).toBe(0.2);
    expect(aggregateWer([])).toBe(0);
  });
});

describe("formatClock (RN-05)", () => {
  it("m:ss e h:mm:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(37.9)).toBe("0:37");
    expect(formatClock(102)).toBe("1:42");
    expect(formatClock(3599)).toBe("59:59");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(-3)).toBe("0:00");
  });
});
