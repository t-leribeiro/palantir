// Motor de transcrição falso para testes e E2E (feature 005, D-08): devolve o roteiro embutido no
// comentário `PALANTIR_SCRIPT=` do OpusTags do áudio sintético (test/support/audio.ts). Sem rede, determinístico.
import { TranscriberError, type TranscribeInput, type TranscribeResult, type Transcriber } from "../../application/ports.js";
import { InvalidOggError, oggOpusDuration } from "../../domain/ogg-duration.js";

export const FAKE_ENGINE = "fake";
const SCRIPT_TAG = "PALANTIR_SCRIPT=";

export interface FakeTranscriberOptions {
  /** Falhas transitórias (`engine_failed`) antes de responder, para testar novas tentativas. */
  readonly failTimes?: number;
}

export function createFakeTranscriber(options: FakeTranscriberOptions = {}): Transcriber {
  let failures = options.failTimes ?? 0;
  return {
    engine: FAKE_ENGINE,
    model: "fake-whisper",
    async transcribe(input: TranscribeInput): Promise<TranscribeResult> {
      if (failures > 0) {
        failures -= 1;
        throw new TranscriberError("engine_failed", "falha transitória simulada");
      }
      let duration: number;
      try {
        duration = oggOpusDuration(input.audio);
      } catch (error) {
        if (error instanceof InvalidOggError) throw new TranscriberError("corrupted", "o motor não conseguiu decodificar o áudio");
        throw error;
      }
      const segments = scriptOf(input.audio);
      return {
        engine: FAKE_ENGINE,
        model: "fake-whisper",
        modelVersion: "1",
        language: input.language ?? "pt",
        durationSeconds: duration,
        text: segments.map((s) => s.text).join(" "),
        segments,
      };
    },
    health: async () => true,
  };
}

function scriptOf(audio: Uint8Array): { start: number; end: number; text: string }[] {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(audio);
  const at = text.indexOf(SCRIPT_TAG);
  if (at < 0) return [];
  const start = at + SCRIPT_TAG.length;
  const end = findJsonEnd(text, start);
  try {
    return JSON.parse(text.slice(start, end)) as { start: number; end: number; text: string }[];
  } catch {
    return [];
  }
}

/** Fim do array JSON que começa em `start` (o comentário não tem terminador próprio no Ogg). */
function findJsonEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i += 1;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "[") depth += 1;
    else if (c === "]" && --depth === 0) return i + 1;
  }
  return text.length;
}
