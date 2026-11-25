// Textos das respostas de gestão e de verificação (feature 006; interfaces/comandos-do-agente.md §2 a §4).
import type { AgentReply } from "../../../contracts/channel/knowledge-channel.js";

/** Resposta informativa, sem citação: o contrato chama de `help` tudo o que não é resposta com evidência. */
export const info = (text: string): AgentReply => ({ text, outcome: "help", citations: [] });

const DATE = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

export const MANAGEMENT_TEXT = {
  pendingAccount: "Sua conta ainda não foi verificada. Mande aqui o código de 6 dígitos que aparece ao rodar npm run whatsapp:link.",
  verified: "Conta verificada. Pode perguntar e gerenciar seus grupos por aqui.",
  wrongCode: (remaining: number) => `Código incorreto. Restam ${remaining} ${remaining === 1 ? "tentativa" : "tentativas"}.`,
  lockedCode: "Código invalidado. Peça um novo com npm run whatsapp:link.",
  expiredCode: "Código expirado. Peça um novo com npm run whatsapp:link.",
  staleList: (ref: string) => `Não sei qual é o ${ref}. Mande "grupos" para ver a lista atual.`,
  noList: 'Mande "grupos" para ver a lista atual.',
  notFound: (ref: string) => `Não encontrei "${ref}" entre suas conversas. Mande "grupos" para ver a lista.`,
  askFollow: (title: string, linksImport: boolean) =>
    [
      `Para acompanhar "${title}", confirme que os participantes foram informados e concordam em ter as mensagens guardadas. Responda "confirmo" em até 5 minutos.`,
      ...(linksImport ? [`O histórico importado de "${title}" será ligado a este grupo.`] : []),
    ].join("\n"),
  followed: (title: string) => `Pronto: "${title}" está sendo acompanhado. As mensagens novas entram a partir de agora.`,
  alreadyFollowing: (title: string, since: Date) => `"${title}" já está sendo acompanhado desde ${DATE.format(since)}.`,
  notAGroup: (title: string) => `"${title}" é uma conversa importada: só dá para acompanhar grupos de que o número participa.`,
  leftGroup: (title: string) => `O número do agente não participa mais de "${title}".`,
  otherAccount: "Esse grupo é acompanhado por outra conta.",
  stopped: (title: string) => `Parei de acompanhar "${title}". O histórico continua disponível nas perguntas; para apagá-lo, mande "apagar ${title}".`,
  notFollowing: (title: string) => `"${title}" não está sendo acompanhado.`,
  askDelete: (title: string) =>
    `Isso apaga "${title}" e tudo o que veio dele: mensagens, áudios e transcrições. Não dá para desfazer. Para confirmar, responda "confirmo apagar ${title}" em até 5 minutos.`,
  nothingStored: (title: string) => `Não há nada guardado de "${title}".`,
  deleting: (title: string) => `Apagando "${title}". Aviso aqui quando terminar.`,
  alreadyDeleting: (title: string) => `"${title}" já está sendo apagado.`,
  wrongDeleteName: (title: string) => `Para apagar "${title}", a confirmação precisa ser "confirmo apagar ${title}".`,
  nothingPending: 'Não há nada esperando confirmação. Mande "apagar <nome>" primeiro.',
  expired: (again: string) => `O pedido expirou. Mande "${again}" de novo.`,
  ambiguousTitle: (title: string) => `Há mais de uma conversa chamada "${title}". Pergunte sem o nome da conversa ou mande "grupos" para ver a lista.`,
} as const;

const NUMBER = new Intl.NumberFormat("pt-BR");
const plural = (n: number, one: string, many: string) => `${NUMBER.format(n)} ${n === 1 ? one : many}`;

/** Aviso de exclusão concluída (RN-08: a única mensagem que o agente manda sem pergunta). */
export function deletionNotice(title: string, counts: { readonly messages: number; readonly audios: number }): string {
  return `Terminei de apagar "${title}": ${plural(counts.messages, "mensagem", "mensagens")} e ${plural(counts.audios, "áudio", "áudios")}. Nada dele aparece mais nas respostas.`;
}
