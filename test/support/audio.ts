// Áudio Ogg/Opus sintético para testes (feature 005): só cabeçalhos válidos e a duração certa, sem som.
// O roteiro de fala vai num comentário do OpusTags; o motor falso (`fake.ts`) o lê como se tivesse transcrito.
// Nenhum áudio real entra nos testes (exports reais são dados de terceiros e ficam só em exports/).

export interface ScriptSegment {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface SyntheticAudioOptions {
  readonly seconds: number;
  /** Falas do roteiro; vazio = áudio sem fala reconhecível. */
  readonly script?: readonly ScriptSegment[];
  /** Muda o conteúdo (e o SHA-256) sem mudar a duração nem o roteiro. */
  readonly salt?: string;
  readonly preSkip?: number;
}

export const SCRIPT_TAG = "PALANTIR_SCRIPT=";

export function syntheticOpus(options: SyntheticAudioOptions): Uint8Array {
  const preSkip = options.preSkip ?? 312;
  const serial = 0x5041_4c41;
  const head = opusHead(preSkip);
  const tags = opusTags([`${SCRIPT_TAG}${JSON.stringify(options.script ?? [])}`, ...(options.salt ? [`SALT=${options.salt}`] : [])]);
  const granule = BigInt(preSkip) + BigInt(Math.round(options.seconds * 48_000));
  return concat([
    page({ headerType: 0x02, granule: 0n, serial, sequence: 0, body: head }),
    page({ headerType: 0x00, granule: 0n, serial, sequence: 1, body: tags }),
    page({ headerType: 0x00, granule: granule / 2n, serial, sequence: 2, body: new Uint8Array(40).fill(0x11) }),
    page({ headerType: 0x04, granule, serial, sequence: 3, body: new Uint8Array(40).fill(0x22) }),
  ]);
}

/** Script de uma fala só, cobrindo o áudio inteiro. */
export const saying = (text: string, seconds = 10): SyntheticAudioOptions => ({ seconds, script: [{ start: 0, end: seconds, text }] });

function opusHead(preSkip: number): Uint8Array {
  const b = new Uint8Array(19);
  const v = new DataView(b.buffer);
  b.set(ascii("OpusHead"), 0);
  b[8] = 1; // versão
  b[9] = 1; // canais
  v.setUint16(10, preSkip, true);
  v.setUint32(12, 48_000, true);
  v.setInt16(16, 0, true);
  b[18] = 0;
  return b;
}

function opusTags(comments: readonly string[]): Uint8Array {
  const vendor = utf8("palantir-test");
  const encoded = comments.map(utf8);
  const size = 8 + 4 + vendor.length + 4 + encoded.reduce((n, c) => n + 4 + c.length, 0);
  const b = new Uint8Array(size);
  const v = new DataView(b.buffer);
  let at = 0;
  b.set(ascii("OpusTags"), at);
  at += 8;
  v.setUint32(at, vendor.length, true);
  at += 4;
  b.set(vendor, at);
  at += vendor.length;
  v.setUint32(at, encoded.length, true);
  at += 4;
  for (const c of encoded) {
    v.setUint32(at, c.length, true);
    at += 4;
    b.set(c, at);
    at += c.length;
  }
  return b;
}

interface PageSpec {
  readonly headerType: number;
  readonly granule: bigint;
  readonly serial: number;
  readonly sequence: number;
  readonly body: Uint8Array;
}

function page(spec: PageSpec): Uint8Array {
  const lacing: number[] = [];
  let left = spec.body.length;
  while (left >= 255) {
    lacing.push(255);
    left -= 255;
  }
  lacing.push(left);
  const header = new Uint8Array(27 + lacing.length);
  const v = new DataView(header.buffer);
  header.set(ascii("OggS"), 0);
  header[4] = 0;
  header[5] = spec.headerType;
  v.setBigUint64(6, spec.granule, true);
  v.setUint32(14, spec.serial, true);
  v.setUint32(18, spec.sequence, true);
  v.setUint32(22, 0, true); // CRC não conferido pelo parser nem pelo motor falso
  header[26] = lacing.length;
  header.set(lacing, 27);
  return concat([header, spec.body]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const utf8 = (s: string) => new TextEncoder().encode(s);
