// Composição da gestão de fontes pelo agente (feature 006): filas da exclusão e do aviso.
import { AGENT_NOTIFY_QUEUE } from "../modules/agent/index.js";
import { SOURCE_DELETE_QUEUE } from "../modules/sources/index.js";
import type { QueueDefinition } from "../platform/queue/index.js";

/** 12 tentativas com recuo exponencial a partir de 30 s: cerca de 34 h antes da fila morta (D-08, EC-03). */
export const SOURCE_DELETE_QUEUE_DEFINITION: QueueDefinition = {
  name: SOURCE_DELETE_QUEUE,
  retryLimit: 12,
  retryDelaySeconds: 30,
  expireInSeconds: 900,
  deadLetter: `${SOURCE_DELETE_QUEUE}.dead`,
};

export const AGENT_NOTIFY_QUEUE_DEFINITION: QueueDefinition = {
  name: AGENT_NOTIFY_QUEUE,
  retryLimit: 5,
  retryDelaySeconds: 10,
  expireInSeconds: 120,
};
