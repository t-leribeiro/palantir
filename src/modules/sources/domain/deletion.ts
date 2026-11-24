// Exclusão de fonte em duas etapas (feature 006, D-07 e D-08; interfaces/jobs-exclusao-e-aviso.md).

/** Fila do job que apaga a fonte, os arquivos de mídia e o que veio dela. */
export const SOURCE_DELETE_QUEUE = "sources.delete";

export interface SourceDeleteJob {
  readonly deletionId: string;
  readonly sourceId: string;
  readonly spaceId: string;
}

/**
 * Fila do aviso de exclusão concluída. Quem consome é o canal (agente); o nome é igual ao `AGENT_NOTIFY_QUEUE` do
 * módulo do agente, conferido em teste, sem o módulo de fontes depender do agente.
 */
export const DELETION_NOTICE_QUEUE = "agent.notify";
