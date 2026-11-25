// Adaptador da Voyage AI (feature 007, D-01; interfaces/embedder-e-varredura.md §3), o fornecedor de embeddings que a
// documentação da Anthropic indica. `input_type` separa pergunta e trecho; `output_dimension` fixa a dimensão.
// Só é montado com PALANTIR_EMBEDDER_ALLOW_REMOTE=true (conferido na configuração): as mensagens saem da máquina.
import { EmbedderError, checkVectors, type Embedder } from "../../application/embedder.js";
import { normalize } from "../../domain/vector.js";
import { MAX_BATCH, call, errorOf, signalOf } from "./openai-compatible.js";

export interface VoyageEmbedderOptions {
  readonly url: string;
  readonly model: string;
  readonly dimensions: number;
  readonly apiKey: string | undefined;
  /** Envia `output_dimension` (padrão: sim). */
  readonly requestDimensions?: boolean;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

export const VOYAGE_EMBEDDER = "voyage";

interface VoyageResponse {
  readonly data?: readonly { readonly index?: number; readonly embedding?: readonly number[] }[];
}

export function createVoyageEmbedder(options: VoyageEmbedderOptions): Embedder {
  const base = options.url.replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;
  const headers = { "content-type": "application/json", authorization: `Bearer ${options.apiKey ?? ""}` };

  async function batch(input: readonly string[], purpose: "document" | "query", signal?: AbortSignal): Promise<number[][]> {
    const body = {
      model: options.model,
      input,
      input_type: purpose,
      ...(options.requestDimensions === false ? {} : { output_dimension: options.dimensions }),
    };
    const response = await call(() =>
      doFetch(`${base}/v1/embeddings`, { method: "POST", headers, body: JSON.stringify(body), signal: signalOf(signal, options.timeoutMs) }),
    );
    if (!response.ok) throw errorOf(response.status);
    const json = (await response.json()) as VoyageResponse;
    const vectors = [...(json.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((d) => normalize(d.embedding ?? []));
    checkVectors(vectors, input.length, options.dimensions);
    return vectors;
  }

  return {
    provider: VOYAGE_EMBEDDER,
    model: options.model,
    dimensions: options.dimensions,
    async embed(texts, purpose, signal) {
      if (!options.apiKey) throw new EmbedderError("rejected");
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += MAX_BATCH) out.push(...(await batch(texts.slice(i, i + MAX_BATCH), purpose, signal)));
      return out;
    },
    async health() {
      return Boolean(options.apiKey);
    },
  };
}
