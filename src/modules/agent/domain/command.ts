// Comandos de gestão e de verificação pelo agente (feature 006, D-01; interfaces/comandos-do-agente.md).
// Palavras fixas, sem LLM: para ações destrutivas, previsibilidade vale mais que flexibilidade.

export type AgentCommand =
  | { readonly kind: "list" }
  | { readonly kind: "more" }
  | { readonly kind: "follow"; readonly ref: string }
  | { readonly kind: "stop"; readonly ref: string }
  | { readonly kind: "delete"; readonly ref: string }
  | { readonly kind: "confirm" }
  | { readonly kind: "confirm_delete"; readonly name: string };

/** Minúsculas, sem acento, sem pontuação e com espaços colapsados: a forma comparada em comandos e nomes. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Rule = readonly [RegExp, (match: RegExpExecArray) => AgentCommand];

const ref = (m: RegExpExecArray) => m[1] ?? "";

// A ordem importa: "confirmo apagar X" antes de "confirmo".
const RULES: readonly Rule[] = [
  [/^(?:grupos|meus grupos|listar grupos|conversas|minhas conversas)$/, () => ({ kind: "list" })],
  [/^mais$/, () => ({ kind: "more" })],
  [/^acompanhar (.+)$/, (m) => ({ kind: "follow", ref: ref(m) })],
  [/^parar(?: de acompanhar)? (.+)$/, (m) => ({ kind: "stop", ref: ref(m) })],
  [/^apagar (.+)$/, (m) => ({ kind: "delete", ref: ref(m) })],
  [/^confirmo apagar (.+)$/, (m) => ({ kind: "confirm_delete", name: ref(m) })],
  [/^confirmo$/, () => ({ kind: "confirm" })],
];

/** O comando de gestão da mensagem, ou `null` quando ela é uma pergunta. */
export function parseCommand(text: string): AgentCommand | null {
  const normalized = normalizeText(text);
  for (const [pattern, build] of RULES) {
    const match = pattern.exec(normalized);
    if (match) return build(match);
  }
  return null;
}

/** Código de verificação de 6 dígitos, com ou sem espaço no meio (ex.: "482 913"). */
export function parseVerificationCode(text: string): string | null {
  const compact = text.replace(/\s+/g, "");
  return /^\d{6}$/.test(compact) ? compact : null;
}
