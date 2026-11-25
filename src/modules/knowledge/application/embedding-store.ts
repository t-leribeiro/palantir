// Porta do registro de modelos e dos vetores (feature 007, D-04, D-06; interfaces/embedder-e-varredura.md §6 e §7).
// "Pendente" é um trecho sem vetor para o modelo: não há coluna de estado.

export type ModelStatus = "building" | "active" | "retired";

/** O que identifica um modelo: mudar qualquer campo é outro modelo (outro espaço de vetores). */
export interface ModelSpec {
  readonly provider: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly dimensions: number;
  readonly queryPrefix: string;
  readonly documentPrefix: string;
  /** Limiar de sentido (D-08); atualizado a cada subida, sem trocar o modelo. */
  readonly minSimilarity: number;
}

export interface RegisteredModel extends ModelSpec {
  readonly id: string;
  readonly status: ModelStatus;
}

export interface ChunkText {
  readonly chunkId: string;
  readonly spaceId: string;
  readonly text: string;
}

export interface ChunkVector {
  readonly chunkId: string;
  readonly spaceId: string;
  readonly vector: readonly number[];
}

export type EnsureOutcome = "active" | "building" | "unchanged";

export interface EmbeddingStore {
  /** Registra a configuração: primeiro modelo nasce ativo; outro, em construção (troca); o mesmo, como está. */
  ensureModel(spec: ModelSpec): Promise<{ readonly model: RegisteredModel; readonly outcome: EnsureOutcome }>;
  /** Modelos que recebem vetores: o ativo e o em construção. */
  targets(): Promise<RegisteredModel[]>;
  activeModel(): Promise<RegisteredModel | null>;
  chunksOfMessage(messageId: string): Promise<ChunkText[]>;
  /** Trechos sem vetor do modelo, das mensagens mais recentes para as mais antigas (ao vivo primeiro). */
  pendingChunks(modelId: string, limit: number): Promise<ChunkText[]>;
  pendingCount(modelId: string): Promise<number>;
  /** Grava sem sobrescrever (idempotente): a indexação e a varredura podem calcular o mesmo trecho. */
  save(modelId: string, vectors: readonly ChunkVector[]): Promise<void>;
  /** Troca atômica: o em construção vira ativo e o ativo anterior se aposenta; cria o índice do novo. */
  activate(modelId: string): Promise<void>;
  /** Apaga até `limit` vetores de modelos aposentados; sem vetores, remove o índice deles. */
  purgeRetired(limit: number): Promise<number>;
}
