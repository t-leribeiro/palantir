// Adaptador de transcrição para APIs compatíveis com a da OpenAI (feature 005, D-08, D-09).
// Hoje fala com o Speaches local; um SaaS com a mesma API é só configuração (URL, modelo, chave e a
// liberação explícita de motor remoto, já conferida na configuração). Nada do áudio nem do texto vai para log.
import { TranscriberError, type TranscribeInput, type TranscribeResult, type Transcriber } from "../../application/ports.js";

export interface OpenAiCompatibleOptions {
  readonly url: string;
  readonly model: string;
  readonly apiKey?: string | undefined;
  /** Prazo mínimo da chamada; o efetivo é o maior entre este e 3× a duração prevista. */
  readonly minTimeoutMs?: number;
  readonly fetch?: typeof fetch;
}

export const OPENAI_COMPATIBLE_ENGINE = "openai-compatible";
const MIN_TIMEOUT_MS = 120_000;

interface VerboseJson {
  readonly language?: string;
  readonly duration?: number;
  readonly text?: string;
  readonly segments?: readonly { readonly start?: number; readonly end?: number; readonly text?: string }[];
}

const LANGUAGE_NAMES: Readonly<Record<string, string>> = { portuguese: "pt", english: "en", spanish: "es" };

export function createOpenAiCompatibleTranscriber(options: OpenAiCompatibleOptions): Transcriber {
  const base = options.url.replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;
  const headers: Record<string, string> = options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {};

  async function transcribe(input: TranscribeInput): Promise<TranscribeResult> {
    const timeout = Math.max(options.minTimeoutMs ?? MIN_TIMEOUT_MS, (input.durationHint ?? 0) * 3 * 1000);
    const response = await call(() =>
      doFetch(`${base}/v1/audio/transcriptions`, {
        method: "POST",
        headers,
        body: form(input, options.model),
        signal: AbortSignal.timeout(timeout),
      }),
    );
    if (!response.ok) throw await errorOf(response);
    return toResult(options.model, (await response.json()) as VerboseJson);
  }

  return {
    engine: OPENAI_COMPATIBLE_ENGINE,
    model: options.model,
    transcribe,
    async health() {
      try {
        const response = await doFetch(`${base}/health`, { headers, signal: AbortSignal.timeout(5_000) });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}

function form(input: TranscribeInput, model: string): FormData {
  const body = new FormData();
  // Nome fixo: o nome original do arquivo nunca sai daqui (privacidade, interfaces/transcriber.md).
  body.set("file", new Blob([input.audio], { type: input.mimeType }), "audio.ogg");
  body.set("model", model);
  body.set("language", input.language ?? "pt");
  body.set("response_format", "verbose_json");
  body.append("timestamp_granularities[]", "segment");
  body.set("temperature", "0");
  return body;
}

async function call(request: () => Promise<Response>): Promise<Response> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new TranscriberError("timeout", "o motor de transcrição não respondeu no prazo");
    }
    throw new TranscriberError("unavailable", "o motor de transcrição não está acessível");
  }
}

async function errorOf(response: Response): Promise<TranscriberError> {
  await response.body?.cancel();
  if (response.status === 400 || response.status === 415 || response.status === 422) {
    return new TranscriberError("corrupted", "o motor não conseguiu decodificar o áudio");
  }
  if (response.status === 404) {
    return new TranscriberError("engine_failed", "modelo não encontrado no motor: baixe com npm run transcricao:modelos");
  }
  return new TranscriberError("engine_failed", `o motor de transcrição falhou (HTTP ${response.status})`);
}

function toResult(model: string, body: VerboseJson): TranscribeResult {
  const segments = (body.segments ?? []).map((s) => {
    if (typeof s.start !== "number" || typeof s.end !== "number") {
      throw new TranscriberError("engine_failed", "o motor devolveu segmentos sem tempo");
    }
    return { start: s.start, end: Math.max(s.end, s.start), text: (s.text ?? "").trim() };
  });
  return {
    engine: OPENAI_COMPATIBLE_ENGINE,
    model,
    modelVersion: "unknown",
    language: languageCode(body.language),
    durationSeconds: typeof body.duration === "number" ? body.duration : null,
    text: (body.text ?? segments.map((s) => s.text).join(" ")).trim(),
    segments: segments.filter((s) => s.text !== ""),
  };
}

function languageCode(language: string | undefined): string {
  const value = (language ?? "").trim().toLowerCase();
  if (/^[a-z]{2}$/.test(value)) return value;
  return LANGUAGE_NAMES[value] ?? "und";
}
