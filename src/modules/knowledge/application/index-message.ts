import { transcriptBlocks, type TranscriptSegment } from "../domain/transcript-chunks.js";

export interface IndexableMessage {
  readonly messageId: string;
  readonly spaceId: string;
  readonly text: string | null;
  /** Segmentos da transcrição ativa, quando a mensagem é um áudio transcrito (feature 005). */
  readonly segments?: readonly TranscriptSegment[];
}

export interface Chunk {
  readonly spaceId: string;
  readonly messageId: string;
  readonly idx: number;
  readonly text: string;
  /** Faixa do áudio de onde o trecho saiu (feature 005, D-14). */
  readonly audioStartS?: number;
  readonly audioEndS?: number;
}

export interface ChunkRepository {
  loadMessage(messageId: string): Promise<IndexableMessage | null>;
  /** Substitui todos os trechos da mensagem por estes; os que sobraram de uma versão anterior saem (D-14). */
  replaceChunks(messageId: string, chunks: readonly Chunk[]): Promise<void>;
}

export interface IndexRequest {
  readonly messageId: string;
  readonly spaceId: string;
}

export type IndexOutcome = "indexed" | "skipped_no_text" | "skipped_missing" | "skipped_space_mismatch";

/** Limite de texto indexável por mensagem (knowledge-indexing EC-04). */
export const MAX_INDEXED_CHARS = 50_000;

export type IndexMessage = (request: IndexRequest) => Promise<IndexOutcome>;

/**
 * Um trecho com o texto (ou a legenda) e, para áudio transcrito, blocos da transcrição com a faixa de tempo
 * (feature 005). Embeddings chegam numa feature seguinte. Reindexar substitui os trechos da mensagem.
 */
export function createIndexMessage(repo: ChunkRepository): IndexMessage {
  return async ({ messageId, spaceId }) => {
    const message = await repo.loadMessage(messageId);
    if (!message) return "skipped_missing";
    if (message.spaceId !== spaceId) return "skipped_space_mismatch";
    const chunks = chunksOf(message);
    if (chunks.length === 0) return "skipped_no_text";
    await repo.replaceChunks(messageId, chunks);
    return "indexed";
  };
}

function chunksOf(message: IndexableMessage): Chunk[] {
  const { messageId, spaceId } = message;
  const text = message.text?.trim() ?? "";
  const chunks: Chunk[] = text === "" ? [] : [{ spaceId, messageId, idx: 0, text: text.slice(0, MAX_INDEXED_CHARS) }];
  let budget = MAX_INDEXED_CHARS;
  for (const block of transcriptBlocks(message.segments ?? [])) {
    if (budget <= 0) break;
    const blockText = block.text.slice(0, budget);
    budget -= blockText.length;
    chunks.push({ spaceId, messageId, idx: chunks.length, text: blockText, audioStartS: block.start, audioEndS: block.end });
  }
  return chunks.map((c, idx) => ({ ...c, idx }));
}
