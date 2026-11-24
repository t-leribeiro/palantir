// Portas do módulo media (feature 005). A aplicação só conhece estas interfaces; S3, motor de transcrição e
// PostgreSQL ficam na infraestrutura (regras object-store-isolated e transcriber-engine-isolated).
import type { MediaKind } from "../domain/media-policy.js";

/** Armazenamento de objetos endereçado pelo conteúdo, com cifra na escrita e na leitura (D-04, D-05). */
export interface ObjectStore {
  /** Cria o bucket se faltar (idempotente). */
  ensureBucket(): Promise<void>;
  /** Grava cifrado só se a chave ainda não existe; `created = false` quando já existia (mesmo conteúdo). */
  putIfAbsent(key: string, bytes: Uint8Array): Promise<{ readonly created: boolean }>;
  /** Lê e decifra; lança se a tag não conferir (objeto adulterado ou chave errada). */
  get(key: string): Promise<Uint8Array>;
  exists(key: string): Promise<boolean>;
}

export interface TranscribeInput {
  /** Binário em claro, até 64 MB. */
  readonly audio: Uint8Array;
  readonly mimeType: string;
  /** Padrão "pt"; omitido = o motor detecta. */
  readonly language?: string;
  /** Segundos, para o prazo da chamada. */
  readonly durationHint?: number;
}

export interface TranscriptSegment {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface TranscribeResult {
  readonly engine: string;
  readonly model: string;
  readonly modelVersion: string;
  readonly language: string;
  readonly durationSeconds: number | null;
  readonly text: string;
  readonly segments: readonly TranscriptSegment[];
}

export type TranscriberErrorKind = "corrupted" | "engine_failed" | "timeout" | "unavailable";

/** `corrupted` não tem nova tentativa; os demais são tentados de novo pelo job (interfaces/transcriber.md). */
export class TranscriberError extends Error {
  constructor(
    readonly kind: TranscriberErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "TranscriberError";
  }
}

/** Motor de transcrição substituível (RN-03, D-08): Whisper local hoje; outro modelo, motor ou SaaS depois. */
export interface Transcriber {
  readonly engine: string;
  readonly model: string;
  transcribe(input: TranscribeInput): Promise<TranscribeResult>;
  health(): Promise<boolean>;
}

/** Anexo como o processamento precisa dele (interfaces/job-media-process.md). */
export interface AttachmentForProcessing {
  readonly id: string;
  readonly messageId: string;
  readonly spaceId: string;
  readonly mediaKind: MediaKind;
  readonly mimeType: string;
  readonly sha256: string | null;
  readonly storageKey: string | null;
  readonly durationSeconds: number | null;
  readonly processingStatus: ProcessingStatus;
  /** Chegada do anexo, para a latência até a transcrição (métrica). */
  readonly createdAt: Date | null;
}

export type ProcessingStatus = "pending" | "done" | "empty" | "too_long" | "failed" | "not_applicable";
export type ProcessingError = "corrupted" | "engine_failed" | "timeout" | "unavailable";

/** Resultado de um processador (hoje, só a transcrição de áudio). */
export interface ProcessorResult {
  readonly status: "done" | "empty";
  readonly transcript: TranscribeResult & { readonly rtf: number | null };
}

/** Processador de um tipo de mídia (RN-10): registrar um novo não muda o fluxo. */
export interface MediaProcessor {
  readonly kind: MediaKind;
  process(attachment: AttachmentForProcessing, bytes: Uint8Array): Promise<ProcessorResult>;
}

/** Tudo o que o processamento grava numa transação, com o job de indexação no outbox (D-13). */
export interface MediaTx {
  /** Carrega o anexo travado para atualização; `null` se não existe. */
  lockAttachment(attachmentId: string): Promise<AttachmentForProcessing | null>;
  saveTranscript(attachment: AttachmentForProcessing, result: ProcessorResult): Promise<void>;
  markStatus(attachmentId: string, status: ProcessingStatus, error?: ProcessingError): Promise<void>;
  enqueueIndex(job: { readonly messageId: string; readonly spaceId: string }): Promise<void>;
}

export interface MediaUnitOfWork {
  run<T>(work: (tx: MediaTx) => Promise<T>): Promise<T>;
  /** Anexo sem travar (leitura antes da chamada lenta ao motor). */
  load(attachmentId: string): Promise<AttachmentForProcessing | null>;
}
