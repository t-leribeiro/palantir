/**
 * Recibos de mensagens dirigidas ao agente (feature 003, D-13). Uma pergunta só é respondida quando o
 * recibo é registrado agora: reentregas do provedor (reconexão, reinício) não geram resposta dupla.
 */
export interface InboundReceipts {
  /** Verdadeiro na primeira vez que o id aparece; falso nas seguintes. */
  registerIfNew(provider: string, externalMessageId: string): Promise<boolean>;
  /** Apaga recibos recebidos antes de `cutoff` e devolve quantos saíram. */
  purgeOlderThan(cutoff: Date): Promise<number>;
}
