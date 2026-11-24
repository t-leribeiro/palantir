// T002 (feature 005): configuração da mídia e da transcrição (RN-03, RF-07, RF-14, RN-10; D-02, D-08, D-09, D-12).
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../../src/platform/config.js";

const base = { DATABASE_URL: "postgres://u:p@localhost:5432/db" };
const mediaKey = Buffer.alloc(32, 9).toString("base64");

function problemsOf(env: Record<string, string>): string {
  try {
    loadConfig({ ...base, ...env });
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as Error).message;
  }
  throw new Error("esperava ConfigError");
}

describe("configuração da mídia e da transcrição", () => {
  it("padrões: só áudio guardado, transcrição ligada, Whisper local pelo adaptador compatível com OpenAI", () => {
    const { media } = loadConfig(base);
    expect(media.storeKinds).toEqual(["audio"]);
    expect(media.key).toBeUndefined();
    expect(media.storage).toEqual({ endpoint: undefined, bucket: "palantir-media", accessKey: undefined, secretKey: undefined });
    expect(media.transcription).toEqual({
      enabled: true,
      engine: "openai-compatible",
      url: "http://127.0.0.1:8090",
      model: "Systran/faster-whisper-small",
      allowRemote: false,
      apiKey: undefined,
      concurrency: 1,
    });
  });

  it("lê a chave de mídia de 32 bytes, o armazenamento S3 e os tipos guardados", () => {
    const { media } = loadConfig({
      ...base,
      PALANTIR_MEDIA_KEY: mediaKey,
      PALANTIR_MEDIA_STORE_KINDS: "audio, image",
      S3_ENDPOINT: "http://localhost:8333",
      S3_BUCKET: "b",
      S3_ACCESS_KEY: "a",
      S3_SECRET_KEY: "s",
    });
    expect(media.key?.length).toBe(32);
    expect(media.storeKinds).toEqual(["audio", "image"]);
    expect(media.storage).toEqual({ endpoint: "http://localhost:8333", bucket: "b", accessKey: "a", secretKey: "s" });
  });

  it("tipos vazios desligam o armazenamento (volta ao comportamento da S3)", () => {
    expect(loadConfig({ ...base, PALANTIR_MEDIA_STORE_KINDS: "" }).media.storeKinds).toEqual([]);
  });

  it("recusa tipo de mídia desconhecido", () => {
    expect(problemsOf({ PALANTIR_MEDIA_STORE_KINDS: "audio,pdf" })).toMatch(/PALANTIR_MEDIA_STORE_KINDS aceita: audio, image, document, video/);
  });

  it("recusa chave de mídia com tamanho errado sem mostrar o valor", () => {
    const short = Buffer.alloc(8, 1).toString("base64");
    const message = problemsOf({ PALANTIR_MEDIA_KEY: short });
    expect(message).toMatch(/PALANTIR_MEDIA_KEY deve ter 32 bytes em base64/);
    expect(message).not.toContain(short);
  });

  it("desliga a transcrição e aceita motor falso, modelo e concorrência", () => {
    const { transcription } = loadConfig({
      ...base,
      PALANTIR_TRANSCRIPTION: "off",
      PALANTIR_TRANSCRIBER: "fake",
      PALANTIR_TRANSCRIBER_MODEL: "Systran/faster-whisper-medium",
      PALANTIR_TRANSCRIBE_CONCURRENCY: "2",
    }).media;
    expect(transcription.enabled).toBe(false);
    expect(transcription.engine).toBe("fake");
    expect(transcription.model).toBe("Systran/faster-whisper-medium");
    expect(transcription.concurrency).toBe(2);
  });

  it("recusa motor desconhecido e concorrência fora de 1 a 4", () => {
    expect(problemsOf({ PALANTIR_TRANSCRIBER: "whisperx" })).toMatch(/PALANTIR_TRANSCRIBER deve ser um de: openai-compatible, fake/);
    expect(problemsOf({ PALANTIR_TRANSCRIBE_CONCURRENCY: "8" })).toMatch(/PALANTIR_TRANSCRIBE_CONCURRENCY deve ser inteiro entre 1 e 4/);
    expect(problemsOf({ PALANTIR_TRANSCRIPTION: "talvez" })).toMatch(/PALANTIR_TRANSCRIPTION deve ser um de: on, off/);
  });

  it("aceita motor em loopback (127.0.0.1, localhost, ::1)", () => {
    for (const url of ["http://127.0.0.1:8090", "http://localhost:9000", "http://[::1]:8090"]) {
      expect(loadConfig({ ...base, PALANTIR_TRANSCRIBER_URL: url }).media.transcription.url).toBe(url);
    }
  });

  it("RN-03: recusa motor fora da máquina sem liberação explícita, sem mostrar a URL", () => {
    const message = problemsOf({ PALANTIR_TRANSCRIBER_URL: "https://api.exemplo.com/stt" });
    expect(message).toMatch(/PALANTIR_TRANSCRIBER_URL fora desta máquina exige PALANTIR_TRANSCRIBER_ALLOW_REMOTE=true/);
    expect(message).not.toContain("exemplo.com");
  });

  it("RN-03: aceita motor remoto com a liberação e a chave da API, sem expor a chave", () => {
    const { transcription } = loadConfig({
      ...base,
      PALANTIR_TRANSCRIBER_URL: "https://api.exemplo.com",
      PALANTIR_TRANSCRIBER_ALLOW_REMOTE: "true",
      PALANTIR_TRANSCRIBER_API_KEY: "sk-segredo",
    }).media;
    expect(transcription.allowRemote).toBe(true);
    expect(transcription.apiKey).toBe("sk-segredo");
  });

  it("recusa URL inválida do motor", () => {
    expect(problemsOf({ PALANTIR_TRANSCRIBER_URL: "não é url" })).toMatch(/PALANTIR_TRANSCRIBER_URL deve ser uma URL http\(s\)/);
  });
});
