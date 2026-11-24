// Duração de um Ogg/Opus sem decodificar (feature 005, D-11): a posição de granulo da última página, menos
// o pre-skip do cabeçalho OpusHead, sobre 48 kHz. Serve para recusar áudio longo demais antes de gastar CPU
// e para mostrar a duração na resposta. Formatos que não são Ogg/Opus ficam com a duração do motor.

const CAPTURE = [0x4f, 0x67, 0x67, 0x53]; // "OggS"
const OPUS_HEAD = "OpusHead";
const OPUS_RATE = 48_000;
const PAGE_HEADER = 27;

export class InvalidOggError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOggError";
  }
}

/** `true` quando os bytes começam como um Ogg (página com "OggS"). */
export const looksLikeOgg = (bytes: Uint8Array): boolean => CAPTURE.every((b, i) => bytes[i] === b);

/** Duração em segundos de um Ogg/Opus; lança `InvalidOggError` se a estrutura não for Ogg/Opus. */
export function oggOpusDuration(bytes: Uint8Array): number {
  if (!looksLikeOgg(bytes)) throw new InvalidOggError("não é um arquivo Ogg");
  const first = readPage(bytes, 0);
  const preSkip = opusPreSkip(bytes, first);
  let last = first;
  for (let at = first.next; at < bytes.length; ) {
    if (!isCaptureAt(bytes, at)) throw new InvalidOggError("página Ogg corrompida");
    last = readPage(bytes, at);
    at = last.next;
  }
  const samples = last.granule - BigInt(preSkip);
  if (samples < 0n) throw new InvalidOggError("posição de granulo inválida");
  return Number(samples) / OPUS_RATE;
}

interface Page {
  readonly bodyStart: number;
  readonly bodyLength: number;
  readonly granule: bigint;
  readonly next: number;
}

function readPage(bytes: Uint8Array, at: number): Page {
  if (at + PAGE_HEADER > bytes.length) throw new InvalidOggError("página Ogg truncada");
  const view = new DataView(bytes.buffer, bytes.byteOffset + at, PAGE_HEADER);
  const segments = bytes[at + 26] ?? 0;
  const tableEnd = at + PAGE_HEADER + segments;
  if (tableEnd > bytes.length) throw new InvalidOggError("página Ogg truncada");
  let bodyLength = 0;
  for (let i = at + PAGE_HEADER; i < tableEnd; i += 1) bodyLength += bytes[i] ?? 0;
  const next = tableEnd + bodyLength;
  if (next > bytes.length) throw new InvalidOggError("página Ogg truncada");
  return { bodyStart: tableEnd, bodyLength, granule: view.getBigUint64(6, true), next };
}

function opusPreSkip(bytes: Uint8Array, page: Page): number {
  const magic = String.fromCharCode(...bytes.subarray(page.bodyStart, page.bodyStart + OPUS_HEAD.length));
  if (magic !== OPUS_HEAD || page.bodyLength < 19) throw new InvalidOggError("Ogg sem cabeçalho Opus");
  return new DataView(bytes.buffer, bytes.byteOffset + page.bodyStart, page.bodyLength).getUint16(10, true);
}

const isCaptureAt = (bytes: Uint8Array, at: number): boolean => CAPTURE.every((b, i) => bytes[at + i] === b);
