// Métricas e logs do canal WhatsApp (feature 003, D-18). Atributos e mensagens nunca levam número nem texto.
import { metrics, type Meter } from "@opentelemetry/api";
import type { SessionState } from "./provider/provider.js";
import type { WhatsAppObserver } from "./whatsapp-channel.js";

export interface ObserverLog {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const STATES: readonly SessionState[] = ["pairing", "connected", "reconnecting", "logged_out"];

export function createOtelWhatsAppObserver(meter: Meter = metrics.getMeter("palantir"), log?: ObserverLog): WhatsAppObserver {
  const received = meter.createCounter("whatsapp_messages_received_total", { description: "Mensagens diretas recebidas pelo número do agente" });
  const replies = meter.createCounter("whatsapp_replies_sent_total", { description: "Respostas enviadas" });
  const parts = meter.createCounter("whatsapp_reply_parts_total", { description: "Partes de resposta enviadas" });
  const unknown = meter.createCounter("whatsapp_unknown_senders_total", { description: "Mensagens de remetentes sem conta ativa (silêncio)" });
  const sendFailures = meter.createCounter("whatsapp_send_failures_total", { description: "Respostas que não puderam ser enviadas" });
  const handlerFailures = meter.createCounter("whatsapp_handler_failures_total", { description: "Falhas ao tratar mensagens" });
  const reconnects = meter.createCounter("whatsapp_reconnects_total", { description: "Quedas seguidas de reconexão" });
  let current: SessionState = "pairing";
  meter
    .createObservableGauge("whatsapp_session_state", { description: "1 no estado atual da sessão, 0 nos demais" })
    .addCallback((result) => {
      for (const state of STATES) result.observe(state === current ? 1 : 0, { state });
    });

  return {
    received: (kind) => received.add(1, { kind }),
    replied: (count) => {
      replies.add(1);
      parts.add(count);
    },
    unknownSender: (reason) => {
      unknown.add(1, { reason });
      log?.info(`mensagem de remetente sem conta ativa ignorada (${reason})`);
    },
    sendFailed: () => {
      sendFailures.add(1);
      log?.error("não foi possível enviar a resposta pelo WhatsApp depois das tentativas");
    },
    handlerFailed: () => {
      handlerFailures.add(1);
      log?.error("falha ao tratar mensagem recebida pelo WhatsApp");
    },
    state: (state) => {
      current = state;
      if (state === "reconnecting") reconnects.add(1);
      const message = `sessão do WhatsApp: ${state}`;
      if (state === "logged_out") log?.warn(message);
      else log?.info(message);
    },
  };
}
