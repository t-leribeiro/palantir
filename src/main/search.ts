// Composição da busca pelo sentido (feature 007, D-01 a D-06, D-10, D-15): escolhe o cálculo de sentido e o
// verificador pela configuração, registra o modelo, calcula junto da indexação e varre os pendentes. Só src/main liga
// as portas às implementações (ADR-0001).
import {
  createActiveModelQueryEmbedding,
  createOtelEmbeddingObserver,
  createEmbedMessageChunks,
  createFakeEmbedder,
  createOpenAiCompatibleEmbedder,
  createPgEmbeddingRepository,
  createSweepEmbeddings,
  createVoyageEmbedder,
  type Embedder,
  type EmbeddingObserver,
  type EmbeddingStore,
  type OtelEmbeddingObserver,
  type ModelSpec,
  type RegisteredModel,
} from "../modules/knowledge/index.js";
import { createOtelSearchObserver, createTypeSafeVerifier, type EvidenceVerifier, type QueryEmbedding, type SearchIndex, type SearchObserver } from "../modules/retrieval/index.js";
import type { EmbedderConfig, SearchConfig } from "../platform/config.js";
import type { Pool } from "../platform/db/index.js";
import type { Logger } from "../platform/logging/logger.js";
import { withSpan } from "../platform/telemetry/index.js";

/** Limiar de sentido quando a medição ainda não foi feita (a subida avisa). */
export const UNCALIBRATED_MIN_SIMILARITY = 0.5;
export const SWEEP_INTERVAL_MS = 30_000;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/** Ganchos para testes e para o eval: cálculo, verificador e observadores injetados, varredura mais frequente. */
export interface SearchCompositionOptions {
  readonly embedder?: Embedder;
  readonly verifier?: EvidenceVerifier;
  readonly embeddingObserver?: EmbeddingObserver;
  readonly searchObserver?: SearchObserver;
  readonly sweepIntervalMs?: number;
}

/** Escolha do cálculo de sentido por configuração (RN-05, D-01): trocar de motor é acrescentar um caso aqui. */
export function buildEmbedder(config: EmbedderConfig): Embedder | undefined {
  if (config.engine === "off") return undefined;
  if (config.engine === "fake") return createFakeEmbedder({ dimensions: config.dimensions });
  if (config.engine === "voyage") {
    return createVoyageEmbedder({ url: config.url, model: config.model, dimensions: config.dimensions, apiKey: config.apiKey, requestDimensions: config.requestDimensions });
  }
  return createOpenAiCompatibleEmbedder({
    url: config.url,
    model: config.model,
    dimensions: config.dimensions,
    apiKey: config.apiKey,
    requestDimensions: config.requestDimensions,
    queryPrefix: config.queryPrefix,
    documentPrefix: config.documentPrefix,
  });
}

export function specOf(search: SearchConfig, embedder: Embedder): ModelSpec {
  const local = embedder.provider === "fake";
  return {
    provider: embedder.provider,
    model: embedder.model,
    baseUrl: local ? "fake" : search.embedder.url,
    dimensions: embedder.dimensions,
    queryPrefix: local ? "" : search.embedder.queryPrefix,
    documentPrefix: local ? "" : search.embedder.documentPrefix,
    minSimilarity: search.semanticMinSimilarity ?? UNCALIBRATED_MIN_SIMILARITY,
  };
}

const sameSpec = (model: RegisteredModel, spec: ModelSpec) =>
  model.provider === spec.provider &&
  model.model === spec.model &&
  model.baseUrl === spec.baseUrl &&
  model.dimensions === spec.dimensions &&
  model.queryPrefix === spec.queryPrefix &&
  model.documentPrefix === spec.documentPrefix;

const isRemote = (url: string) => !URL.canParse(url) || !LOOPBACK.has(new URL(url).hostname);

/**
 * O adaptador de cada modelo registrado: o configurado usa o embedder montado; um anterior (durante a troca) é
 * remontado pelo registro, com a chave do ambiente, e nunca fala com fora da máquina sem a liberação explícita.
 */
export function embedderResolver(search: SearchConfig, configured: Embedder | undefined): (model: RegisteredModel) => Embedder | undefined {
  const spec = configured ? specOf(search, configured) : undefined;
  const rebuilt = new Map<string, Embedder | undefined>();
  return (model) => {
    if (configured && spec && sameSpec(model, spec)) return configured;
    if (!rebuilt.has(model.id)) rebuilt.set(model.id, rebuild(search.embedder, model));
    return rebuilt.get(model.id);
  };
}

function rebuild(config: EmbedderConfig, model: RegisteredModel): Embedder | undefined {
  if (model.provider === "fake" || (isRemote(model.baseUrl) && !config.allowRemote)) return undefined;
  const engine = model.provider === "voyage" ? "voyage" : "openai-compatible";
  return buildEmbedder({ ...config, engine, url: model.baseUrl, model: model.model, dimensions: model.dimensions, queryPrefix: model.queryPrefix, documentPrefix: model.documentPrefix });
}

export function buildVerifier(search: SearchConfig, injected?: EvidenceVerifier): { verifier: EvidenceVerifier; minProbability: number } | undefined {
  const { verifier } = search;
  if (injected) return { verifier: injected, minProbability: verifier.minProbability };
  if (verifier.engine !== "typesafe" || !verifier.apiKey) return undefined;
  return { verifier: createTypeSafeVerifier({ apiKey: verifier.apiKey, model: verifier.model }), minProbability: verifier.minProbability };
}

export interface SearchParts {
  readonly queryEmbedding?: QueryEmbedding;
  readonly verifier?: { verifier: EvidenceVerifier; minProbability: number };
  readonly observer?: SearchObserver;
}

/** Peças da busca para a API e o WhatsApp: sentido da pergunta no modelo ativo e o verificador, se ligados. */
export function buildSearchParts(search: SearchConfig, pool: Pool, options: SearchCompositionOptions = {}): SearchParts {
  const embedder = options.embedder ?? buildEmbedder(search.embedder);
  const verifier = buildVerifier(search, options.verifier);
  const parts: { -readonly [K in keyof SearchParts]: SearchParts[K] } = {};
  if (embedder) {
    const store = createPgEmbeddingRepository(pool);
    parts.queryEmbedding = createActiveModelQueryEmbedding({ store, embedderFor: embedderResolver(search, embedder) });
  }
  if (verifier) parts.verifier = verifier;
  parts.observer = options.searchObserver ?? defaultSearchObserver();
  return parts;
}

let searchObserver: SearchObserver | undefined;
let embeddingObserver: OtelEmbeddingObserver | undefined;
/** Um instrumento por processo: a API e o WhatsApp montam a busca uma vez cada. */
const defaultSearchObserver = () => (searchObserver ??= createOtelSearchObserver());
const defaultEmbeddingObserver = () => (embeddingObserver ??= createOtelEmbeddingObserver());

/** Um span por forma de busca (D-14, retrieval RNF-03), sem a pergunta nos atributos. */
export function tracedIndex(index: SearchIndex): SearchIndex {
  const traced: SearchIndex = { search: (...args) => withSpan("retrieval.lexical", () => index.search(...args)) };
  if (index.typo) traced.typo = (...args) => withSpan("retrieval.typo", () => index.typo?.(...args) ?? Promise.resolve([]));
  if (index.semantic) traced.semantic = (...args) => withSpan("retrieval.semantic", () => index.semantic?.(...args) ?? Promise.resolve([]));
  return traced;
}

export interface SemanticIndexing {
  /** Depois de indexar a mensagem; nunca lança (RN-07). */
  afterIndex(messageId: string): Promise<void>;
  stop(): void;
}

const NOOP_INDEXING: SemanticIndexing = { afterIndex: async () => undefined, stop: () => undefined };

/** Avisos da subida, sem conteúdo (D-15): serviço remoto ligado e limiar não calibrado. */
export function warnRemote(search: SearchConfig, logger: Logger): void {
  if (search.embedder.engine !== "off" && search.embedder.allowRemote) logger.warn("cálculo de sentido remoto liberado: as mensagens podem sair desta máquina");
  if (search.verifier.engine === "typesafe") logger.warn("verificador externo ligado: perguntas e trechos candidatos saem desta máquina");
}

/**
 * Worker (D-05, D-06): registra o modelo configurado, calcula o sentido junto da indexação e varre os pendentes a
 * cada 30 s, um ciclo por vez. Sem cálculo configurado, não faz nada e a busca segue só por palavra.
 */
export async function startSemanticIndexing(search: SearchConfig, pool: Pool, logger: Logger, options: SearchCompositionOptions = {}): Promise<SemanticIndexing> {
  const embedder = options.embedder ?? buildEmbedder(search.embedder);
  warnRemote(search, logger);
  if (!embedder) {
    logger.info("busca pelo sentido desligada (PALANTIR_EMBEDDER=off): a busca segue por palavra");
    return NOOP_INDEXING;
  }
  const store: EmbeddingStore = createPgEmbeddingRepository(pool);
  const { model, outcome } = await store.ensureModel(specOf(search, embedder));
  if (search.semanticMinSimilarity === undefined) logger.warn({ minSimilarity: UNCALIBRATED_MIN_SIMILARITY }, "limiar de sentido não calibrado: rode npm run eval:busca -- medir");
  logger.info({ provider: model.provider, model: model.model, dimensions: model.dimensions, status: outcome }, outcome === "building" ? "troca de modelo de embeddings começou" : "modelo de embeddings ativo");
  const observer = options.embeddingObserver ?? defaultEmbeddingObserver();
  const deps = { store, embedderFor: embedderResolver(search, embedder), observer };
  const embed = createEmbedMessageChunks(deps);
  const sweep = createSweepEmbeddings(deps);
  let running = false;
  const cycle = async () => {
    if (running) return;
    running = true;
    try {
      const result = await withSpan("knowledge.embed.sweep", () => sweep());
      if (result.embedded > 0 || result.activated) logger.info({ embedded: result.embedded, pending: result.pending, activated: result.activated }, "varredura de embeddings");
      if (result.deferred) logger.warn({ pending: result.pending }, "varredura de embeddings adiada: o motor falhou ou estourou o prazo; nova tentativa no próximo ciclo");
    } catch (error) {
      logger.warn({ err: { name: (error as Error).name } }, "varredura de embeddings falhou; nova tentativa no próximo ciclo");
    } finally {
      running = false;
    }
  };
  const probe = async () => {
    if ("embedderUp" in observer) (observer as OtelEmbeddingObserver).embedderUp(await embedder.health(), embedder.provider);
  };
  void cycle();
  void probe();
  const timer = setInterval(() => void cycle().then(probe), options.sweepIntervalMs ?? SWEEP_INTERVAL_MS);
  timer.unref();
  return {
    async afterIndex(messageId) {
      try {
        await withSpan("knowledge.embed", () => embed(messageId));
      } catch (error) {
        logger.warn({ messageId, err: { name: (error as Error).name } }, "falha ao calcular o sentido; a varredura tenta de novo");
      }
    },
    stop: () => clearInterval(timer),
  };
}
