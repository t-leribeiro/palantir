// Busca por contexto (feature 008, D-04; spec retrieval RF-07): a mensagem citada inteira e as vizinhas da mesma
// conversa, sempre dentro do espaço do dono. Sem conteúdo em log: quem chama decide o que mostrar.

/** Anexo de áudio da mensagem citada, com a transcrição ativa por segmentos. */
export interface SourceAudio {
  readonly attachmentId: string;
  readonly mimeType: string;
  readonly sizeBytes: number | null;
  readonly durationSeconds: number | null;
  /** O arquivo está no armazenamento (só então pode ir de volta ao dono). */
  readonly stored: boolean;
  /** Estado da transcrição: `done`, `pending`, `failed`, `empty`, `too_long` ou `not_applicable`. */
  readonly processing: string;
  readonly segments: readonly { readonly start: number; readonly end: number; readonly text: string }[];
}

/** A mensagem citada, inteira. */
export interface CitedMessage {
  readonly messageId: string;
  readonly author: string;
  readonly sourceTitle: string;
  readonly sentAt: Date;
  readonly kind: string;
  /** Texto da mensagem, com a legenda de mídia; vazio para áudio sem legenda. */
  readonly text: string;
  readonly audio?: SourceAudio;
  /** Feature 009: a mensagem é um guardado; o tema dele (o cabeçalho diz "Guardado em <tema>", sem vizinhas). */
  readonly savedTheme?: string;
}

/** Vizinha na mesma conversa. Para áudio, o texto é o da transcrição ativa (vazio sem transcrição). */
export interface ContextMessage {
  readonly messageId: string;
  readonly author: string;
  readonly sentAt: Date;
  readonly kind: string;
  readonly text: string;
  readonly durationSeconds?: number;
}

export type SourceContextResult =
  | { readonly status: "found"; readonly message: CitedMessage; readonly before: readonly ContextMessage[]; readonly after: readonly ContextMessage[] }
  /** A conversa está sendo apagada (S5): nada dela é mostrado. */
  | { readonly status: "deleted" }
  /** A mensagem não existe ou é de outro espaço. */
  | { readonly status: "not_found" };

export interface SourceContext {
  /** A mensagem e até `k` vizinhas antes e `k` depois, em ordem, só da mesma conversa e do mesmo espaço. */
  around(spaceId: string, messageId: string, k: number): Promise<SourceContextResult>;
}

/** Quantas vizinhas de cada lado (esclarecimento de 2026-11-25, D-05). */
export const CONTEXT_NEIGHBORS = 3;
