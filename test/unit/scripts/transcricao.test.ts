// T019 (feature 005, RF-11, D-19): lógica da medição dos modelos de transcrição.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import {
  formatTable,
  monthOf,
  parseDockerMemory,
  parseFleursTsv,
  pickAudios,
  pickFleurs,
  recommend,
  suspectedReferenceModel,
  seeded,
  type MeasureResult,
} from "../../../scripts/transcricao/core.js";
import { extractFromTarGz } from "../../../scripts/transcricao/tar.js";

const dir = mkdtempSync(join(tmpdir(), "palantir-medicao-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("sorteio dos áudios reais", () => {
  const candidates = [
    ...Array.from({ length: 6 }, (_, i) => ({ name: `PTT-202511${String(i + 1).padStart(2, "0")}-WA000${i}.opus`, seconds: 30 })),
    ...Array.from({ length: 6 }, (_, i) => ({ name: `PTT-202602${String(i + 1).padStart(2, "0")}-WA001${i}.opus`, seconds: 45 })),
    { name: "PTT-20260301-WA0099.opus", seconds: 5 },
    { name: "PTT-20260302-WA0098.opus", seconds: 600 },
  ];

  it("é determinístico pela semente e muda com outra semente", () => {
    expect(pickAudios(candidates, 4, 1)).toEqual(pickAudios(candidates, 4, 1));
    expect(pickAudios(candidates, 4, 1)).not.toEqual(pickAudios(candidates, 4, 2));
  });

  it("só 10 a 120 s; alterna os meses", () => {
    const picked = pickAudios(candidates, 4, 7);
    expect(picked.every((p) => p.seconds >= 10 && p.seconds <= 120)).toBe(true);
    expect(new Set(picked.map((p) => monthOf(p.name)))).toEqual(new Set(["2025-11", "2026-02"]));
    expect(pickAudios(candidates, 50, 7)).toHaveLength(12);
  });

  it("mês pelo nome do Android, do iOS ou desconhecido", () => {
    expect(monthOf("PTT-20251101-WA0003.opus")).toBe("2025-11");
    expect(monthOf("00000012-AUDIO-2026-11-12-10-06-00.opus")).toBe("2026-11");
    expect(monthOf("audio.opus")).toBe("?");
  });

  it("seeded gera números em [0, 1)", () => {
    const r = seeded(42);
    const xs = Array.from({ length: 100 }, () => r());
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe("FLEURS", () => {
  const tsv = [
    "1860\t111.wav\tO gabinete afirmou.\to gabinete afirmou\to | g a\t142080\tMALE",
    "1860\t222.wav\tO gabinete afirmou.\to gabinete afirmou\to | g a\t114240\tMALE",
    "1900\t333.wav\tOutra frase.\toutra frase\to | u\t90000\tFEMALE",
    "linha quebrada",
  ].join("\n");

  it("lê id, arquivo e transcrição bruta; ignora linhas inválidas", () => {
    expect(parseFleursTsv(tsv)).toEqual([
      { id: "1860", fileName: "111.wav", raw: "O gabinete afirmou." },
      { id: "1860", fileName: "222.wav", raw: "O gabinete afirmou." },
      { id: "1900", fileName: "333.wav", raw: "Outra frase." },
    ]);
  });

  it("escolhe frases distintas (uma gravação por id)", () => {
    const picked = pickFleurs(parseFleursTsv(tsv), 10, 1);
    expect(picked.map((p) => p.fileName).sort()).toEqual(["111.wav", "333.wav"]);
  });
});

describe("docker stats", () => {
  it("converte o uso de memória em bytes", () => {
    expect(parseDockerMemory("1.5GiB / 4GiB")).toBe(1.5 * 1024 ** 3);
    expect(parseDockerMemory("512MiB / 4GiB")).toBe(512 * 1024 ** 2);
    expect(parseDockerMemory("900kB / 1GB")).toBe(900_000);
    expect(parseDockerMemory("--")).toBeUndefined();
  });
});

describe("tabela e recomendação", () => {
  const r = (model: string, set: MeasureResult["set"], wer: number, rtf: number): MeasureResult => ({ model, set, audios: 20, seconds: 1084, wer, rtf, peakMemoryBytes: 1.1 * 1024 ** 3 });

  it("recomenda o mais preciso que cumpre WER ≤ 20% e tempo real ≤ 0,5 nos áudios reais", () => {
    const results = [r("small", "real", 0.18, 0.3), r("medium", "real", 0.12, 0.45), r("turbo", "real", 0.08, 0.9), r("turbo", "fleurs", 0.04, 0.8)];
    expect(recommend(results)).toBe("medium");
    expect(recommend([r("small", "fleurs", 0.1, 0.3)])).toBe("small");
    expect(recommend([r("small", "real", 0.3, 0.3)])).toBeUndefined();
  });

  it("mostra só números e os ids dos modelos", () => {
    const text = formatTable([r("Systran/faster-whisper-small", "real", 0.142, 0.31)]);
    expect(text).toContain("Systran/faster-whisper-small  real          20    18:04  14,2%         0,31  1,1 GB");
    expect(text).toContain("Recomendado: Systran/faster-whisper-small");
    expect(formatTable([r("x", "real", 0.5, 2)])).toContain("Nenhum modelo cumpriu");
  });

  it("arredonda a duração total sem gerar 60 segundos", () => {
    expect(formatTable([{ ...r("x", "real", 0.1, 0.3), seconds: 1259.65 }])).toContain("  21:00  ");
    expect(formatTable([{ ...r("x", "real", 0.1, 0.3), seconds: 59.4 }])).toContain("   0:59  ");
  });

  it("mostra os reais antes do FLEURS, na ordem de medição", () => {
    const text = formatTable([r("a", "real", 0.1, 0.3), r("a", "fleurs", 0.1, 0.3), r("b", "real", 0.1, 0.3)]);
    const lines = text.split("\n").slice(1, 4).map((l) => l.split(/\s+/).slice(0, 2).join(" "));
    expect(lines).toEqual(["a real", "b real", "a fleurs"]);
  });

  it("desconfia de referência que saiu de um dos modelos e decide pelo FLEURS", () => {
    const results = [r("small", "real", 0.12, 0.3), r("turbo", "real", 0.002, 0.4), r("small", "fleurs", 0.08, 0.3), r("turbo", "fleurs", 0.15, 0.6)];
    expect(suspectedReferenceModel(results)).toBe("turbo");
    expect(suspectedReferenceModel([r("small", "real", 0.12, 0.3), r("turbo", "fleurs", 0.001, 0.3)])).toBeUndefined();
    expect(recommend(results)).toBe("small");
    expect(formatTable(results)).toContain("Atenção: turbo ficou com WER abaixo de 2%");
    expect(formatTable([r("small", "real", 0.12, 0.3)])).not.toContain("Atenção");
  });
});

/** Monta um .tar.gz mínimo (formato ustar) com os arquivos dados. */
function tarGz(files: Record<string, string>): Buffer {
  const blocks: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const header = Buffer.alloc(512);
    header.write(name, 0, "utf8");
    header.write("0000644\0", 100);
    header.write("0000000\0", 108);
    header.write("0000000\0", 116);
    header.write(`${Buffer.byteLength(content).toString(8).padStart(11, "0")}\0`, 124);
    header.write("00000000000\0", 136);
    header.write("        ", 148);
    header.write("0", 156);
    header.write("ustar\0", 257);
    const sum = header.reduce((a, b) => a + b, 0);
    header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
    const body = Buffer.from(content);
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

describe("extractFromTarGz", () => {
  it("extrai só os arquivos pedidos, pelo nome base, e ignora caminhos com ..", async () => {
    const file = join(dir, "amostra.tar.gz");
    writeFileSync(file, tarGz({ "test/111.wav": "a".repeat(700), "test/222.wav": "b", "../escape.wav": "x", "test/333.wav": "c" }));
    const out = join(dir, "saida");
    const extracted = await extractFromTarGz(file, new Set(["111.wav", "333.wav", "escape.wav"]), out);
    expect(extracted.sort()).toEqual(["111.wav", "333.wav"]);
    expect(readFileSync(join(out, "111.wav"), "utf8")).toBe("a".repeat(700));
    expect(readFileSync(join(out, "333.wav"), "utf8")).toBe("c");
  });
});
