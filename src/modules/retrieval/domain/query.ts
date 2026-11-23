/**
 * Palavras que estruturam a pergunta mas não dizem do que ela trata ("quem falou de X?").
 * Ficam fora da busca para que "falou" não traga qualquer mensagem com "falou" (D-10, ajuste de 2026-11-23).
 * O banco aplica o mesmo stemmer a esta lista e aos termos da pergunta.
 */
export const QUESTION_FILLER_WORDS = [
  "quem",
  "alguém",
  "alguem",
  "algum",
  "alguma",
  "falou",
  "falaram",
  "falar",
  "disse",
  "disseram",
  "comentou",
  "comentaram",
  "mencionou",
  "mencionaram",
  "citou",
  "citaram",
  "sobre",
  "acharam",
  "achou",
] as const;
