// Lógica pura da medição de transcrição (feature 005, RF-11, D-19): sorteio determinístico dos áudios,
// escolha das frases do FLEURS, leitura do `docker stats`, tabela e recomendação. Nada aqui lê ou mostra
// texto de fala: só nomes gerados (NN), durações e números.

/** Gerador pseudoaleatório com semente (mulberry32): o mesmo sorteio a cada execução. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export interface AudioCandidate {
  readonly name: string;
  readonly seconds: number;
}

export const MIN_SECONDS = 10;
export const MAX_SECONDS = 120;

/** Mês pelo nome do arquivo do WhatsApp (`PTT-20251101-WA0003.opus` → 2025-11); sem data, "?". */
export function monthOf(name: string): string {
  const match = /(20\d{2})-(\d{2})-\d{2}/.exec(name) ?? /(20\d{2})(\d{2})\d{2}/.exec(name);
  return match ? `${match[1]}-${match[2]}` : "?";
}

/**
 * Sorteio estratificado por mês (D-19): embaralha dentro de cada mês e alterna entre os meses, para não
 * concentrar num dia só. Só áudios de 10 a 120 s.
 */
export function pickAudios(candidates: readonly AudioCandidate[], count: number, seed: number): AudioCandidate[] {
  const random = seeded(seed);
  const eligible = candidates.filter((c) => c.seconds >= MIN_SECONDS && c.seconds <= MAX_SECONDS);
  const byMonth = new Map<string, AudioCandidate[]>();
  for (const c of [...eligible].sort((a, b) => a.name.localeCompare(b.name))) {
    const month = monthOf(c.name);
    byMonth.set(month, [...(byMonth.get(month) ?? []), c]);
  }
  const queues = shuffle([...byMonth.keys()].sort(), random).map((m) => shuffle(byMonth.get(m) ?? [], random));
  const picked: AudioCandidate[] = [];
  while (picked.length < count && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && picked.length < count) picked.push(next);
    }
  }
  return picked;
}

export interface FleursRow {
  readonly id: string;
  readonly fileName: string;
  readonly raw: string;
}

/** Linhas do `test.tsv` do FLEURS: id, arquivo, transcrição bruta, normalizada, caracteres, amostras, gênero. */
export function parseFleursTsv(text: string): FleursRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split("\t"))
    .filter((cols) => cols.length >= 3 && cols[1]?.endsWith(".wav"))
    .map((cols) => ({ id: cols[0] ?? "", fileName: cols[1] ?? "", raw: cols[2] ?? "" }));
}

/** Frases distintas (o FLEURS repete a mesma frase com falantes diferentes): o primeiro arquivo de cada id. */
export function pickFleurs(rows: readonly FleursRow[], count: number, seed: number): FleursRow[] {
  const firstById = new Map<string, FleursRow>();
  for (const row of rows) if (!firstById.has(row.id)) firstById.set(row.id, row);
  return shuffle([...firstById.values()], seeded(seed)).slice(0, count);
}

const UNITS: Readonly<Record<string, number>> = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, kB: 1000, MB: 1000 ** 2, GB: 1000 ** 3 };

/** Uso de memória do `docker stats` ("1.123GiB / 4GiB") em bytes; `undefined` se não entender. */
export function parseDockerMemory(line: string): number | undefined {
  const match = /^\s*([\d.]+)\s*([KMG]i?B|[kMG]B|B)\b/.exec(line);
  if (!match) return undefined;
  const unit = UNITS[match[2] ?? ""];
  return unit ? Number(match[1]) * unit : undefined;
}

export interface MeasureResult {
  readonly model: string;
  readonly set: "real" | "fleurs";
  readonly audios: number;
  readonly seconds: number;
  readonly wer: number;
  readonly rtf: number;
  readonly peakMemoryBytes: number | undefined;
}

export const TARGET_WER = 0.2;
export const TARGET_RTF = 0.5;

/** Abaixo disso nos reais, a referência é quase igual à saída do modelo: rascunho dele sem correção. */
export const REFERENCE_BIAS_WER = 0.02;

/** O modelo de que as referências dos áudios reais parecem ter saído, se algum. */
export function suspectedReferenceModel(results: readonly MeasureResult[]): string | undefined {
  return results.find((r) => r.set === "real" && r.wer < REFERENCE_BIAS_WER)?.model;
}

/**
 * O mais preciso nos áudios reais entre os que cumprem WER ≤ 20% e tempo real ≤ 0,5. Usa o FLEURS
 * quando não há reais ou quando as referências dos reais parecem ter saído de um dos modelos.
 */
export function recommend(results: readonly MeasureResult[]): string | undefined {
  const sets = new Set(results.map((r) => r.set));
  const decisive = sets.has("real") && suspectedReferenceModel(results) === undefined ? "real" : "fleurs";
  const candidates = results.filter((r) => r.set === decisive && r.wer <= TARGET_WER && r.rtf <= TARGET_RTF);
  return [...candidates].sort((a, b) => a.wer - b.wer || a.rtf - b.rtf)[0]?.model;
}

const pct = (n: number) => `${(n * 100).toFixed(1).replace(".", ",")}%`;
const dec = (n: number) => n.toFixed(2).replace(".", ",");
const clock = (s: number) => {
  const total = Math.round(s);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
const gb = (b: number | undefined) => (b === undefined ? "?" : `${(b / 1024 ** 3).toFixed(1).replace(".", ",")} GB`);

/** Tabela só com números (nunca texto de fala nem nome de arquivo). */
export function formatTable(results: readonly MeasureResult[]): string {
  const width = Math.max(6, ...results.map((r) => r.model.length));
  const header = `${"Modelo".padEnd(width)}  Conjunto  Áudios  Duração  WER     Tempo real  Memória`;
  const ordered = [...results].sort((a, b) => (a.set === b.set ? 0 : a.set === "real" ? -1 : 1));
  const rows = ordered.map(
    (r) =>
      `${r.model.padEnd(width)}  ${r.set.padEnd(8)}  ${String(r.audios).padStart(6)}  ${clock(r.seconds).padStart(7)}  ${pct(r.wer).padEnd(6)}  ${dec(r.rtf).padStart(10)}  ${gb(r.peakMemoryBytes)}`,
  );
  const best = recommend(results);
  const footer = best
    ? `Recomendado: ${best} (o mais preciso com WER ≤ 20% e tempo real ≤ 0,5)`
    : "Nenhum modelo cumpriu WER ≤ 20% e tempo real ≤ 0,5: escolha pelo equilíbrio entre precisão e velocidade.";
  const biased = suspectedReferenceModel(results);
  const warning = biased
    ? [
        `Atenção: ${biased} ficou com WER abaixo de 2% nos áudios reais. As referências parecem ser rascunho dele sem correção,`,
        "então a WER dos reais mede semelhança com esse modelo, não precisão. A recomendação usou o FLEURS.",
      ]
    : [];
  return [header, ...rows, ...warning, footer].join("\n");
}
