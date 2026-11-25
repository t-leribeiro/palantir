// Apelidos dos autores para o verificador externo (ADR-0013, item 1): o nome de quem escreveu não sai da máquina,
// mas a autoria continua no julgamento. Cada autor distinto vira "pessoa N" dentro de uma requisição, e um nome na
// pergunta que coincida com o de um autor (inteiro ou só o primeiro nome, quando não é ambíguo) vira o mesmo apelido.

export interface Pseudonyms {
  /** Apelido de cada autor, na ordem em que aparece. */
  readonly of: (author: string) => string;
  /** A pergunta com os nomes de autores trocados pelos apelidos. */
  readonly question: string;
}

interface Folded {
  readonly text: string;
  /** Posição no texto original de cada caractere do texto dobrado. */
  readonly origin: readonly number[];
}

/** Sem acento e em minúsculas, guardando a posição original para trocar no texto como foi escrito. */
function fold(text: string): Folded {
  let out = "";
  const origin: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const piece = text.charAt(i).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    for (const ch of piece) {
      out += ch;
      origin.push(i);
    }
  }
  return { text: out, origin };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Nomes procurados na pergunta: o inteiro e, se tiver letras e não for de outro autor também, o primeiro nome. */
function namesOf(authors: readonly string[]): Map<string, string> {
  const firstCount = new Map<string, number>();
  const firstOf = (a: string) => fold(a).text.trim().split(/\s+/)[0] ?? "";
  for (const a of authors) firstCount.set(firstOf(a), (firstCount.get(firstOf(a)) ?? 0) + 1);
  const names = new Map<string, string>();
  authors.forEach((a, i) => {
    const alias = `pessoa ${i + 1}`;
    const full = fold(a).text.trim();
    if (full) names.set(full, alias);
    const first = firstOf(a);
    if (/\p{L}/u.test(first) && first.length >= 2 && firstCount.get(first) === 1 && !names.has(first)) names.set(first, alias);
  });
  return names;
}

/** Troca, do fim para o começo, cada nome achado (palavra inteira, o mais longo primeiro) pelo apelido. */
function replaceNames(question: string, names: Map<string, string>): string {
  const folded = fold(question);
  const ordered = [...names.keys()].sort((a, b) => b.length - a.length);
  if (ordered.length === 0) return question;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${ordered.map(escape).join("|")})(?![\\p{L}\\p{N}])`, "gu");
  const hits = [...folded.text.matchAll(pattern)].map((m) => ({
    start: folded.origin[m.index] ?? 0,
    end: (folded.origin[m.index + m[0].length - 1] ?? question.length - 1) + 1,
    alias: names.get(m[0]) ?? "pessoa",
  }));
  let out = question;
  for (const hit of hits.reverse()) out = out.slice(0, hit.start) + hit.alias + out.slice(hit.end);
  return out;
}

export function pseudonymize(question: string, authors: readonly string[]): Pseudonyms {
  const distinct = [...new Set(authors)];
  const aliases = new Map(distinct.map((a, i) => [a, `pessoa ${i + 1}`]));
  return { of: (author) => aliases.get(author) ?? "pessoa", question: replaceNames(question, namesOf(distinct)) };
}
