// Itens guardados com tema (feature 009, D-09, D-10; knowledge-indexing.md RF-05 a RF-07).
// O item é conhecimento derivado: aponta sempre para a mensagem guardada na fonte Guardados (EvidenceReference).
import { normalizeContent, parseTheme, type Theme } from "../domain/theme.js";

/** O que identifica o conteúdo na duplicata do tema: o texto ou o SHA-256 do arquivo do áudio. */
export interface SavedContent {
  readonly text?: string;
  readonly sha256?: string;
}

/** Um item na listagem do tema. */
export interface SavedEntry {
  readonly itemId: string;
  readonly messageId: string;
  readonly kind: string;
  /** Texto da mensagem ou o começo da transcrição; `null` para áudio ainda sem transcrição. */
  readonly text: string | null;
  readonly savedAt: Date;
  readonly durationSeconds?: number;
}

export interface ThemeListing {
  /** Nome do tema como foi gravado na primeira vez; `null` quando o tema não existe. */
  readonly theme: string | null;
  readonly total: number;
  readonly items: readonly SavedEntry[];
}

export interface ThemeCount {
  readonly theme: string;
  readonly count: number;
}

/** O item de uma mensagem guardada, para confirmar o "esquece a N". */
export interface SavedMessage {
  readonly itemId: string;
  readonly theme: string;
  readonly text: string | null;
}

/**
 * Uma mensagem já guardada, achada pelo id externo original (o que o canal deu antes de o tema entrar no id).
 * Serve para citar com "guarda em X" depois que a memória de 10 min passou (demonstração de 2026-11-26).
 */
export interface SavedOrigin {
  readonly kind: "text" | "link" | "audio" | "image" | "document";
  readonly text: string | null;
  readonly sentAt: Date;
  readonly attachment: {
    readonly mimeType: string;
    readonly sizeBytes: number | null;
    readonly sha256: string;
    readonly storageKey: string;
    readonly durationSeconds: number | null;
  } | null;
}

export interface ForgetResult {
  readonly itemId: string;
  readonly theme: string;
  /** Chaves de arquivos que ficaram sem referência e precisam ser purgadas do armazenamento. */
  readonly orphanStorageKeys: readonly string[];
}

export interface SavedItemStore {
  /** Conteúdos dos itens do tema (texto e SHA-256 do anexo), para a duplicata. */
  themeContents(spaceId: string, normalized: string): Promise<readonly SavedContent[]>;
  /** Cria o item com o tema (reaproveitado pela forma normalizada); idempotente pela mensagem. */
  attach(spaceId: string, theme: Theme, messageId: string): Promise<{ readonly itemId: string; readonly theme: string }>;
  listTheme(spaceId: string, normalized: string, limit: number): Promise<ThemeListing>;
  listThemes(spaceId: string, limit: number): Promise<readonly ThemeCount[]>;
  /** O nome gravado do tema (o da primeira vez), ou `null` se ele não existe. */
  themeName(spaceId: string, normalized: string): Promise<string | null>;
  savedMessage(spaceId: string, messageId: string): Promise<SavedMessage | null>;
  savedOrigin(spaceId: string, originExternalId: string): Promise<SavedOrigin | null>;
  /** Apaga a mensagem só se for um guardado do espaço; a cascata e os gatilhos levam o item e o tema vazio. */
  forget(spaceId: string, messageId: string): Promise<ForgetResult | null>;
}

/** Itens mostrados por listagem: o "mostra a N" da S7 vai de 1 a 9 (D-12). */
export const LISTING_LIMIT = 9;
export const THEMES_LIMIT = 20;

export interface SavedItems {
  /** O conteúdo já está guardado neste tema (RN-07)? Tema inválido nunca tem duplicata. */
  isDuplicate(spaceId: string, themeName: string, content: SavedContent): Promise<boolean>;
  save(spaceId: string, themeName: string, messageId: string): Promise<{ readonly itemId: string; readonly theme: string }>;
  listTheme(spaceId: string, themeName: string): Promise<ThemeListing>;
  listThemes(spaceId: string): Promise<readonly ThemeCount[]>;
  /** Como mostrar o tema (RN-03): o nome da primeira vez, ou o que o dono escreveu se ele ainda não existe. */
  displayName(spaceId: string, themeName: string): Promise<string>;
  savedMessage(spaceId: string, messageId: string): Promise<SavedMessage | null>;
  savedOrigin(spaceId: string, originExternalId: string): Promise<SavedOrigin | null>;
  forget(spaceId: string, messageId: string): Promise<ForgetResult | null>;
}

export class InvalidThemeError extends Error {
  constructor(readonly reason: "empty" | "too_long") {
    super(`Tema inválido: ${reason}`);
    this.name = "InvalidThemeError";
  }
}

function themeOrThrow(raw: string): Theme {
  const theme = parseTheme(raw);
  if (typeof theme === "string") throw new InvalidThemeError(theme);
  return theme;
}

function sameContent(a: SavedContent, b: SavedContent): boolean {
  if (a.sha256 && b.sha256) return a.sha256 === b.sha256;
  if (a.text === undefined || b.text === undefined) return false;
  return normalizeContent(a.text) === normalizeContent(b.text);
}

export function createSavedItems(store: SavedItemStore): SavedItems {
  return {
    async isDuplicate(spaceId, themeName, content) {
      const theme = parseTheme(themeName);
      if (typeof theme === "string") return false;
      const existing = await store.themeContents(spaceId, theme.normalized);
      return existing.some((saved) => sameContent(saved, content));
    },
    save: async (spaceId, themeName, messageId) => store.attach(spaceId, themeOrThrow(themeName), messageId),
    async listTheme(spaceId, themeName) {
      const theme = parseTheme(themeName);
      if (typeof theme === "string") return { theme: null, total: 0, items: [] };
      return store.listTheme(spaceId, theme.normalized, LISTING_LIMIT);
    },
    listThemes: (spaceId) => store.listThemes(spaceId, THEMES_LIMIT),
    async displayName(spaceId, themeName) {
      const theme = parseTheme(themeName);
      if (typeof theme === "string") return themeName.trim();
      return (await store.themeName(spaceId, theme.normalized)) ?? theme.name;
    },
    savedMessage: (spaceId, messageId) => store.savedMessage(spaceId, messageId),
    savedOrigin: (spaceId, originExternalId) => store.savedOrigin(spaceId, originExternalId),
    forget: (spaceId, messageId) => store.forget(spaceId, messageId),
  };
}
