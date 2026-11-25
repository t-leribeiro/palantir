import { normalizeText } from "./command.js";

/**
 * Pergunta que pede um áudio ("em qual áudio falaram de X?", feature 005, emenda E001): a palavra
 * "áudio" diz onde procurar, não do que se fala. Ela sai dos termos e vira filtro por tipo de mensagem.
 */
const AUDIO_WORD = /(?<![\p{L}\p{N}])[áa]udios?(?![\p{L}\p{N}])/giu;
const WORD = /[\p{L}\p{N}]+/gu;

/** Conversa do espaço que a pergunta pode citar pelo nome (feature 006, RN-11). */
export interface CatalogEntry {
  readonly sourceId: string;
  readonly title: string;
}

export interface QuestionScope {
  /** Texto usado na busca, sem as palavras que só definem o escopo. */
  readonly query: string;
  /** `true` quando a pergunta pede só áudios. */
  readonly onlyAudio: boolean;
  /** Fontes citadas pelo nome; ausente quando a pergunta não cita nenhuma. */
  readonly sourceIds?: readonly string[];
  /** Nome citado que pertence a mais de uma conversa: o agente não busca e pede para desambiguar. */
  readonly ambiguousTitle?: string;
}

interface Token {
  readonly word: string;
  readonly start: number;
  readonly end: number;
}

const tokensOf = (text: string): Token[] => [...text.matchAll(WORD)].map((m) => ({ word: normalizeText(m[0]), start: m.index, end: m.index + m[0].length }));

/** Onde a sequência de palavras do nome aparece na pergunta (por palavra inteira), ou `null`. */
function findSpan(tokens: readonly Token[], titleWords: readonly string[]): { start: number; end: number } | null {
  for (let i = 0; i + titleWords.length <= tokens.length; i += 1) {
    if (titleWords.every((w, j) => tokens[i + j]?.word === w)) {
      const first = tokens[i];
      const last = tokens[i + titleWords.length - 1];
      if (first && last) return { start: first.start, end: last.end };
    }
  }
  return null;
}

interface Match {
  readonly key: string;
  readonly span: { start: number; end: number };
  readonly words: number;
}

/** O nome completo citado mais longo (RN-11): mais palavras, depois mais letras. */
function longestMatch(question: string, catalog: readonly CatalogEntry[]): Match | null {
  const tokens = tokensOf(question);
  let best: Match | null = null;
  for (const entry of catalog) {
    const key = normalizeText(entry.title);
    const words = key.split(" ").filter(Boolean);
    const span = words.length > 0 ? findSpan(tokens, words) : null;
    if (span && (!best || words.length > best.words || (words.length === best.words && key.length > best.key.length))) best = { key, span, words: words.length };
  }
  return best;
}

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

export function questionScope(question: string, catalog: readonly CatalogEntry[] = []): QuestionScope {
  const match = longestMatch(question, catalog);
  const withoutTitle = match ? `${question.slice(0, match.span.start)} ${question.slice(match.span.end)}` : question;
  const query = collapse(withoutTitle.replace(AUDIO_WORD, " "));
  const onlyAudio = query !== collapse(withoutTitle);
  if (!match) return { query, onlyAudio };
  const named = catalog.filter((c) => normalizeText(c.title) === match.key);
  const titles = new Set(named.map((c) => c.sourceId));
  if (titles.size > 1) return { query, onlyAudio, ambiguousTitle: named[0]?.title ?? match.key };
  return { query, onlyAudio, sourceIds: [...titles] };
}
