// Trechos da transcrição para a busca (feature 005, D-14): segmentos agrupados em blocos curtos, sem
// quebrar segmento, cada um com a faixa do áudio de onde saiu. Blocos curtos dão o ponto do áudio preciso
// e um trecho legível na citação.

export interface TranscriptSegment {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface TranscriptBlock {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export const BLOCK_MAX_CHARS = 400;

export function transcriptBlocks(segments: readonly TranscriptSegment[], maxChars = BLOCK_MAX_CHARS): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  let current: { texts: string[]; start: number; end: number; length: number } | undefined;
  for (const segment of segments) {
    const text = segment.text.replace(/\s+/g, " ").trim();
    if (text === "") continue;
    if (current && current.length + 1 + text.length > maxChars) {
      blocks.push({ text: current.texts.join(" "), start: current.start, end: current.end });
      current = undefined;
    }
    if (!current) current = { texts: [], start: segment.start, end: segment.end, length: -1 };
    current.texts.push(text);
    current.end = Math.max(current.end, segment.end);
    current.length += 1 + text.length;
  }
  if (current) blocks.push({ text: current.texts.join(" "), start: current.start, end: current.end });
  return blocks;
}
