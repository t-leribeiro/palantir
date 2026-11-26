// "mostra a N" (feature 008, D-01, interfaces/comando-mostrar.md §1): palavras fixas, sem LLM, como os comandos
// da S5. "me mostra o que a Ana disse" continua sendo pergunta.
import { normalizeText } from "./command.js";

const SHOW_SOURCE = /^(?:mostra|mostrar|ver|original)(?: a)? ([1-9])$/;

/** O número da citação pedida, ou `null` quando a mensagem não é o comando. */
export function parseShowSource(text: string): number | null {
  const match = SHOW_SOURCE.exec(normalizeText(text));
  return match ? Number(match[1]) : null;
}
