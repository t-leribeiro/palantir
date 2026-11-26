// Tema dado pelo dono ao guardar (feature 009, RN-03): texto livre de até 60 caracteres, comparado já normalizado.
// "Arquitetura de Software" e "arquitetura de software" são o mesmo tema; o nome mostrado é o da primeira vez.

export const THEME_MAX_CHARS = 60;
/** Tema de quem guardou sem dizer qual e não respondeu em 10 min (RN-04). */
export const UNTITLED_THEME = "sem tema";

/** Minúsculas, sem acento, sem pontuação e com espaços colapsados (a mesma forma dos comandos do agente). */
export function normalizeTheme(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Theme {
  /** Como o dono escreveu, sem os espaços das pontas. */
  readonly name: string;
  readonly normalized: string;
}

export type ThemeProblem = "empty" | "too_long";

/** O tema pronto para gravar, ou o motivo de recusa. */
export function parseTheme(raw: string): Theme | ThemeProblem {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length > THEME_MAX_CHARS) return "too_long";
  const normalized = normalizeTheme(name);
  if (normalized === "") return "empty";
  return { name, normalized };
}

/** Forma comparada na duplicata de texto (RN-07): a mesma do tema, sem limite de tamanho. */
export const normalizeContent = normalizeTheme;
