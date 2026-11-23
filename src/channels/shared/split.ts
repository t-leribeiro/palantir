import type { AgentReply } from "../../contracts/channel/knowledge-channel.js";

/**
 * Divide um texto em partes dentro do limite do canal, quebrando de preferência em fim de linha
 * para não cortar uma citação no meio (channel-contract EC-04). Compartilhado pelos adaptadores.
 */
export function splitText(text: string, maxLength: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    for (const piece of chunk(line, maxLength)) {
      const candidate = current === "" ? piece : `${current}\n${piece}`;
      if (candidate.length <= maxLength) {
        current = candidate;
      } else {
        parts.push(current);
        current = piece;
      }
    }
  }
  if (current !== "") parts.push(current);
  return parts;
}

export function splitForChannel(reply: AgentReply, maxLength: number): string[] {
  return splitText(reply.text, maxLength);
}

function chunk(line: string, maxLength: number): string[] {
  if (line.length <= maxLength) return [line];
  const out: string[] = [];
  for (let i = 0; i < line.length; i += maxLength) out.push(line.slice(i, i + maxLength));
  return out;
}
