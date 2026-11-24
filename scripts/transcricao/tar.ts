// Extrai só alguns arquivos de um .tar.gz em streaming (feature 005, D-19: amostra do FLEURS), sem
// dependência nova: cabeçalhos tar de 512 bytes depois do gunzip. Nomes com ".." ou absolutos são ignorados.
import { createReadStream, createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { basename, join } from "node:path";
import { createGunzip } from "node:zlib";

const BLOCK = 512;

interface Header {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

function readHeader(block: Buffer): Header | undefined {
  if (block.every((b) => b === 0)) return undefined;
  const field = (start: number, length: number) => block.subarray(start, start + length).toString("utf8").replace(/\0.*$/s, "");
  const prefix = field(345, 155);
  const name = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
  return { name, size: Number.parseInt(field(124, 12).trim() || "0", 8), type: field(156, 1) || "0" };
}

const isSafe = (name: string) => !name.split("/").includes("..") && !name.startsWith("/");

/** Leitor incremental: cada chamada consome o que der do buffer e devolve se precisa de mais dados. */
class TarReader {
  private pending = Buffer.alloc(0);
  private left = 0;
  private padding = 0;
  private out: WriteStream | undefined;
  readonly extracted: string[] = [];
  /** Arquivos sendo gravados: a extração só termina quando todos foram fechados no disco. */
  readonly closing: Promise<void>[] = [];

  constructor(
    private readonly wanted: ReadonlySet<string>,
    private readonly destDir: string,
  ) {}

  push(chunk: Buffer): void {
    this.pending = Buffer.concat([this.pending, chunk]);
    while (this.step()) {
      // continua enquanto houver dados para o próximo passo
    }
  }

  /** Um passo: pula o preenchimento, copia o corpo do arquivo atual ou lê o próximo cabeçalho. */
  private step(): boolean {
    if (this.padding > 0) return this.skipPadding();
    if (this.left > 0) return this.copyBody();
    if (this.pending.length < BLOCK) return false;
    this.startEntry(readHeader(this.pending.subarray(0, BLOCK)));
    this.pending = this.pending.subarray(BLOCK);
    return true;
  }

  private skipPadding(): boolean {
    const skip = Math.min(this.padding, this.pending.length);
    this.pending = this.pending.subarray(skip);
    this.padding -= skip;
    return this.padding === 0 && this.pending.length > 0;
  }

  private copyBody(): boolean {
    const take = Math.min(this.left, this.pending.length);
    this.out?.write(this.pending.subarray(0, take));
    this.pending = this.pending.subarray(take);
    this.left -= take;
    if (this.left > 0) return false;
    this.finishEntry();
    return true;
  }

  private startEntry(header: Header | undefined): void {
    if (!header) return;
    const name = basename(header.name);
    const keep = header.type === "0" && isSafe(header.name) && this.wanted.has(name);
    if (keep) this.extracted.push(name);
    this.out = keep ? createWriteStream(join(this.destDir, name)) : undefined;
    this.left = header.size;
    this.padding = (BLOCK - (header.size % BLOCK)) % BLOCK;
    if (header.size === 0) this.finishEntry();
    else this.paddingAfterBody = this.padding;
    this.padding = 0;
  }

  private paddingAfterBody = 0;

  private finishEntry(): void {
    const out = this.out;
    if (out) this.closing.push(new Promise<void>((resolve, reject) => out.on("error", reject).end(resolve)));
    this.out = undefined;
    this.padding = this.paddingAfterBody;
    this.paddingAfterBody = 0;
  }
}

/** Escreve em `destDir` os arquivos cujo nome base está em `wanted`; devolve os nomes extraídos. */
export async function extractFromTarGz(file: string, wanted: ReadonlySet<string>, destDir: string): Promise<string[]> {
  mkdirSync(destDir, { recursive: true });
  const reader = new TarReader(wanted, destDir);
  await new Promise<void>((resolve, reject) => {
    createReadStream(file)
      .pipe(createGunzip())
      .on("data", (chunk: Buffer) => reader.push(chunk))
      .on("end", () => resolve())
      .on("error", reject);
  });
  await Promise.all(reader.closing);
  return reader.extracted;
}
