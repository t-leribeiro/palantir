export interface IndexableMessage {
  readonly messageId: string;
  readonly spaceId: string;
  readonly text: string | null;
}

export interface Chunk {
  readonly spaceId: string;
  readonly messageId: string;
  readonly idx: number;
  readonly text: string;
}

export interface ChunkRepository {
  loadMessage(messageId: string): Promise<IndexableMessage | null>;
  /** Cria ou substitui o chunk (messageId, idx): reprocessar o mesmo job não duplica. */
  upsertChunk(chunk: Chunk): Promise<void>;
}

export interface IndexRequest {
  readonly messageId: string;
  readonly spaceId: string;
}

export type IndexOutcome = "indexed" | "skipped_no_text" | "skipped_missing" | "skipped_space_mismatch";

/** Limite de texto indexável por mensagem (knowledge-indexing EC-04). */
export const MAX_INDEXED_CHARS = 50_000;

export type IndexMessage = (request: IndexRequest) => Promise<IndexOutcome>;

/** Esqueleto: um chunk por mensagem, só texto (D-09). Embeddings chegam numa feature seguinte. */
export function createIndexMessage(repo: ChunkRepository): IndexMessage {
  return async ({ messageId, spaceId }) => {
    const message = await repo.loadMessage(messageId);
    if (!message) return "skipped_missing";
    if (message.spaceId !== spaceId) return "skipped_space_mismatch";
    const text = message.text?.trim() ?? "";
    if (text === "") return "skipped_no_text";
    await repo.upsertChunk({ spaceId, messageId, idx: 0, text: text.slice(0, MAX_INDEXED_CHARS) });
    return "indexed";
  };
}
