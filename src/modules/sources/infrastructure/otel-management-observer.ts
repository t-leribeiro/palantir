// Métricas da gestão de fontes (feature 006, D-16; interfaces/jobs-exclusao-e-aviso.md §3). Atributos nunca levam
// nome de grupo, telefone ou texto: só o tipo do comando, o tipo do item e o resultado.
import { metrics, type Meter } from "@opentelemetry/api";

export interface ManagementObserver {
  command(kind: string): void;
  deletionCompleted(seconds: number, counts: { readonly messages: number; readonly audios: number; readonly objects: number }): void;
  deletionsInProgress(count: number, oldestSeconds: number): void;
  notification(outcome: "sent" | "duplicate" | "failed"): void;
}

export function createOtelManagementObserver(meter: Meter = metrics.getMeter("palantir")): ManagementObserver {
  const commands = meter.createCounter("agent_commands_total", { description: "Comandos de gestão de fontes recebidos pelo agente, por tipo" });
  const items = meter.createCounter("source_deletion_items_total", { description: "Itens apagados em exclusões de fonte, por tipo" });
  const duration = meter.createHistogram("source_deletion_seconds", { unit: "s", description: "Do pedido à conclusão da exclusão de uma fonte" });
  const notifications = meter.createCounter("agent_notifications_total", { description: "Avisos de exclusão concluída, por resultado" });
  let inProgress = 0;
  let oldest = 0;
  meter.createObservableGauge("source_deletions_in_progress", { description: "Exclusões de fonte pedidas e ainda não concluídas" }).addCallback((r) => r.observe(inProgress));
  meter.createObservableGauge("source_deletion_oldest_seconds", { unit: "s", description: "Idade da exclusão em andamento mais antiga" }).addCallback((r) => r.observe(oldest));
  return {
    command: (kind) => commands.add(1, { command: kind }),
    deletionCompleted(seconds, counts) {
      duration.record(seconds);
      items.add(counts.messages, { kind: "messages" });
      items.add(counts.audios, { kind: "audios" });
      items.add(counts.objects, { kind: "objects" });
    },
    deletionsInProgress(count, oldestSeconds) {
      inProgress = count;
      oldest = oldestSeconds;
    },
    notification: (outcome) => notifications.add(1, { outcome }),
  };
}
