import type { AgentReply } from "../../contracts/channel/knowledge-channel.js";

/**
 * Divide a resposta em partes dentro do limite do canal, quebrando de preferência em fim de linha
 * para não cortar uma citação no meio (channel-contract EC-04).
 */
export function splitForChannel(reply: AgentReply, maxLength: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const line of reply.text.split("\n")) {
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

function chunk(line: string, maxLength: number): string[] {
  if (line.length <= maxLength) return [line];
  const out: string[] = [];
  for (let i = 0; i < line.length; i += maxLength) out.push(line.slice(i, i + maxLength));
  return out;
}
