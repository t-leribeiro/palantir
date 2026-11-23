// Renderização do AgentReply neutro para o WhatsApp (feature 003: RF-08, D-11).
import type { AgentReply } from "../../contracts/channel/knowledge-channel.js";
import { splitText } from "../shared/split.js";

export const WHATSAPP_MAX_MESSAGE_LENGTH = 4000;
/** Espaço reservado para o prefixo "(nn/nn)\n" quando a resposta tem mais de uma parte. */
const PREFIX_BUDGET = 8;

/** `**negrito**` vira `*negrito*` e `__itálico__` vira `_itálico_`, a marcação do próprio WhatsApp. */
function toWhatsAppMarkup(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "*$1*").replace(/__(.+?)__/g, "_$1_");
}

/** Partes prontas para envio, numeradas "(1/3)" quando a resposta não cabe numa mensagem só. */
export function renderForWhatsApp(reply: AgentReply, maxLength = WHATSAPP_MAX_MESSAGE_LENGTH): string[] {
  const text = toWhatsAppMarkup(reply.text);
  if (text.length <= maxLength) return [text];
  const parts = splitText(text, maxLength - PREFIX_BUDGET);
  return parts.map((part, i) => `(${i + 1}/${parts.length})\n${part}`);
}
