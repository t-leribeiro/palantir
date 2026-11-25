// Adaptador de embeddings para APIs compatíveis com a da OpenAI (feature 007, D-01, D-02; interfaces/embedder-e-varredura.md
// §2). Hoje fala com o Text Embeddings Inference local; a OpenAI ou outro serviço com `POST /v1/embeddings` é só
// configuração (URL, modelo, chave e a liberação de serviço remoto, já conferida na configuração). Nada do texto nem
// dos vetores vai para log.
import { EmbedderError, checkVectors, type EmbedPurpose, type Embedder } from "../../application/embedder.js";
import { normalize } from "../../domain/vector.js";

export interface OpenAiCompatibleEmbedderOptions {
  readonly url: string;
  readonly model: string;
  readonly dimensions: number;
  readonly apiKey?: string | undefined;
  /** Envia `dimensions` (modelos que encurtam o vetor, como os text-embedding-3 da OpenAI). */
  readonly requestDimensions?: boolean;
  readonly queryPrefix?: string;
  readonly documentPrefix?: string;
  /** Prazo de cada chamada (padrão 10 s); a busca passa um `signal` mais curto para a pergunta. */
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

export const OPENAI_COMPATIBLE_EMBEDDER = "openai-compatible";
export const MAX_BATCH = 32;
const DEFAULT_TIMEOUT_MS = 10_000;

interface EmbeddingsResponse {
  readonly model?: string;
  readonly data?: readonly { readonly index?: number; readonly embedding?: readonly number[] }[];
}

export function createOpenAiCompatibleEmbedder(options: OpenAiCompatibleEmbedderOptions): Embedder {
  const base = options.url.replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;
  const headers: Record<string, string> = { "content-type": "application/json", ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}) };
  const prefixOf = (purpose: EmbedPurpose) => (purpose === "query" ? options.queryPrefix : options.documentPrefix) ?? "";

  async function batch(texts: readonly string[], purpose: EmbedPurpose, signal?: AbortSignal): Promise<number[][]> {
    const body = {
      model: options.model,
      input: texts.map((t) => `${prefixOf(purpose)}${t}`),
      ...(options.requestDimensions ? { dimensions: options.dimensions } : {}),
    };
    const response = await call(() =>
      doFetch(`${base}/v1/embeddings`, { method: "POST", headers, body: JSON.stringify(body), signal: signalOf(signal, options.timeoutMs) }),
    );
    if (!response.ok) throw errorOf(response.status);
    const json = (await response.json()) as EmbeddingsResponse;
    if (json.model && !sameModel(json.model, options.model)) throw new EmbedderError("model_mismatch");
    const vectors = [...(json.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((d) => normalize(d.embedding ?? []));
    checkVectors(vectors, texts.length, options.dimensions);
    return vectors;
  }

  return {
    provider: OPENAI_COMPATIBLE_EMBEDDER,
    model: options.model,
    dimensions: options.dimensions,
    async embed(texts, purpose, signal) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += MAX_BATCH) out.push(...(await batch(texts.slice(i, i + MAX_BATCH), purpose, signal)));
      return out;
    },
    async health() {
      try {
        const response = await doFetch(`${base}/v1/models`, { headers, signal: AbortSignal.timeout(5_000) });
        await response.body?.cancel();
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}

/** Compara o modelo servido com o configurado, sem diferenciar maiúsculas (o motor local devolve o id do Hugging Face). */
function sameModel(served: string, configured: string): boolean {
  return served.toLowerCase() === configured.toLowerCase();
}

export function signalOf(signal: AbortSignal | undefined, timeoutMs = DEFAULT_TIMEOUT_MS): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function call(request: () => Promise<Response>): Promise<Response> {
  try {
    return await request();
  } catch (error) {
    const name = (error as Error).name;
    throw new EmbedderError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "unavailable");
  }
}

export function errorOf(status: number): EmbedderError {
  if (status === 429) return new EmbedderError("rate_limited");
  if (status >= 500) return new EmbedderError("unavailable");
  return new EmbedderError("rejected");
}
