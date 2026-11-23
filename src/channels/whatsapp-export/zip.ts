// Leitura segura do arquivo exportado (D-02): .zip (com o .txt da conversa) ou .txt solto, em streaming.
// Nada é extraído para o disco nem copiado (privacidade).
import { createReadStream, existsSync } from "node:fs";
import { extname } from "node:path";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import yauzl from "yauzl";

export type ExportFileErrorCode = "not_found" | "no_chat_file" | "unsafe" | "invalid_zip";

export class ExportFileError extends Error {
  constructor(
    readonly code: ExportFileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExportFileError";
  }
}

export interface ReadOptions {
  /** Tamanho máximo do conteúdo descompactado (padrão 2 GB). */
  readonly maxBytes?: number;
  /** Taxa máxima de compressão aceita por entrada (padrão 100:1). */
  readonly maxRatio?: number;
}

const DEFAULT_MAX_BYTES = 2 * 1024 ** 3;
const DEFAULT_MAX_RATIO = 100;

/** Linhas do .txt da conversa, lidas sob demanda. */
export async function* readExportLines(file: string, options: ReadOptions = {}): AsyncGenerator<string> {
  if (!existsSync(file)) throw new ExportFileError("not_found", `Arquivo não encontrado: ${file}`);
  const stream = extname(file).toLowerCase() === ".zip" ? await openChatInZip(file, options) : createReadStream(file);
  yield* createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
}

async function openChatInZip(file: string, options: ReadOptions): Promise<Readable> {
  const zip = await openZip(file);
  const entries = await listEntries(zip);
  assertSafe(entries, options);
  const chat = entries.find((e) => extname(e.fileName).toLowerCase() === ".txt");
  if (!chat) {
    zip.close();
    throw new ExportFileError("no_chat_file", "O ZIP não contém o .txt da conversa exportada.");
  }
  return new Promise((resolve, reject) => {
    zip.openReadStream(chat, (error, stream) => (error ? reject(asInvalid(error)) : resolve(stream)));
  });
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false, validateEntrySizes: true }, (error, zip) =>
      error ? reject(asInvalid(error)) : resolve(zip),
    );
  });
}

function listEntries(zip: yauzl.ZipFile): Promise<yauzl.Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: yauzl.Entry[] = [];
    zip.on("entry", (entry: yauzl.Entry) => {
      entries.push(entry);
      zip.readEntry();
    });
    zip.on("end", () => resolve(entries));
    zip.on("error", (error: Error) => reject(asInvalid(error)));
    zip.readEntry();
  });
}

function assertSafe(entries: readonly yauzl.Entry[], options: ReadOptions): void {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRatio = options.maxRatio ?? DEFAULT_MAX_RATIO;
  const total = entries.reduce((sum, e) => sum + e.uncompressedSize, 0);
  if (total > maxBytes) throw new ExportFileError("unsafe", "Arquivo recusado por segurança: conteúdo maior que o limite.");
  const bomb = entries.find((e) => e.compressedSize > 0 && e.uncompressedSize / e.compressedSize > maxRatio);
  if (bomb) throw new ExportFileError("unsafe", `Arquivo recusado por segurança: compressão acima de ${maxRatio}:1.`);
}

/** yauzl já recusa caminhos absolutos e com ".."; esses erros viram recusa por segurança. */
function asInvalid(error: Error): ExportFileError {
  const unsafe = /invalid relative path|absolute path|invalid characters/i.test(error.message);
  return unsafe
    ? new ExportFileError("unsafe", "Arquivo recusado por segurança: caminho fora da pasta do ZIP.")
    : new ExportFileError("invalid_zip", "ZIP inválido ou corrompido.");
}
