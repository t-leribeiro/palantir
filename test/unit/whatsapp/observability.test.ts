// T016: métricas do canal WhatsApp (D-18), sem número nem texto em atributos ou logs.
import { MeterProvider, MetricReader, type ResourceMetrics } from "@opentelemetry/sdk-metrics";
import { describe, expect, it } from "vitest";
import { createOtelWhatsAppObserver } from "../../../src/channels/whatsapp/observability.js";

class TestReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

async function collect(reader: TestReader): Promise<Map<string, { attributes: Record<string, unknown>; value: unknown }[]>> {
  const { resourceMetrics } = (await reader.collect()) as { resourceMetrics: ResourceMetrics };
  const out = new Map<string, { attributes: Record<string, unknown>; value: unknown }[]>();
  for (const scope of resourceMetrics.scopeMetrics) {
    for (const metric of scope.metrics) {
      out.set(
        metric.descriptor.name,
        metric.dataPoints.map((p) => ({ attributes: p.attributes, value: p.value })),
      );
    }
  }
  return out;
}

function setup() {
  const reader = new TestReader();
  const provider = new MeterProvider({ readers: [reader] });
  const logs: string[] = [];
  const log = { info: (m: string) => void logs.push(`info ${m}`), warn: (m: string) => void logs.push(`warn ${m}`), error: (m: string) => void logs.push(`error ${m}`) };
  const observer = createOtelWhatsAppObserver(provider.getMeter("teste"), log);
  return { reader, observer, logs };
}

describe("createOtelWhatsAppObserver", () => {
  it("conta mensagens por tipo, respostas, desconhecidos e falhas", async () => {
    const { reader, observer } = setup();
    observer.received("text");
    observer.received("text");
    observer.received("duplicate");
    observer.replied(3);
    observer.unknownSender("unknown");
    observer.sendFailed();
    observer.handlerFailed();
    const metrics = await collect(reader);
    expect(metrics.get("whatsapp_messages_received_total")).toEqual(
      expect.arrayContaining([
        { attributes: { kind: "text" }, value: 2 },
        { attributes: { kind: "duplicate" }, value: 1 },
      ]),
    );
    expect(metrics.get("whatsapp_replies_sent_total")?.[0]?.value).toBe(1);
    expect(metrics.get("whatsapp_reply_parts_total")?.[0]?.value).toBe(3);
    expect(metrics.get("whatsapp_unknown_senders_total")).toEqual([{ attributes: { reason: "unknown" }, value: 1 }]);
    expect(metrics.get("whatsapp_send_failures_total")?.[0]?.value).toBe(1);
    expect(metrics.get("whatsapp_handler_failures_total")?.[0]?.value).toBe(1);
  });

  it("publica o estado da sessão como gauge 0/1 e conta reconexões", async () => {
    const { reader, observer, logs } = setup();
    observer.state("connected");
    observer.state("reconnecting");
    observer.state("logged_out");
    const metrics = await collect(reader);
    const state = metrics.get("whatsapp_session_state") ?? [];
    expect(state.find((p) => p.attributes.state === "logged_out")?.value).toBe(1);
    expect(state.find((p) => p.attributes.state === "connected")?.value).toBe(0);
    expect(metrics.get("whatsapp_reconnects_total")?.[0]?.value).toBe(1);
    expect(logs).toContain("warn sessão do WhatsApp: logged_out");
  });
});
