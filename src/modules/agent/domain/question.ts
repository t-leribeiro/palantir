/**
 * Pergunta que pede um áudio ("em qual áudio falaram de X?", feature 005, emenda E001): a palavra
 * "áudio" diz onde procurar, não do que se fala. Ela sai dos termos e vira filtro por tipo de mensagem.
 */
const AUDIO_WORD = /(?<![\p{L}\p{N}])[áa]udios?(?![\p{L}\p{N}])/giu;

export interface QuestionScope {
  /** Texto usado na busca, sem as palavras que só definem o escopo. */
  readonly query: string;
  /** `true` quando a pergunta pede só áudios. */
  readonly onlyAudio: boolean;
}

export function questionScope(question: string): QuestionScope {
  const query = question.replace(AUDIO_WORD, " ").replace(/\s+/g, " ").trim();
  return { query, onlyAudio: query !== question.replace(/\s+/g, " ").trim() };
}
