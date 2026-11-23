// Rotas HTTP do canal fake (interfaces/http-api.md), sem banco: handlers substituídos.
import { afterEach, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "../../support/http-app.js";

const inbound = {
  conversationId: "fake-group-1",
  externalMessageId: "m-1",
  senderId: "ana",
  senderName: "Ana",
  text: "O Grafana Alloy centraliza a coleta de telemetria",
  timestamp: "2026-11-22T10:00:00-03:00",
};

let current: TestApp | undefined;
afterEach(async () => {
  await current?.app.close();
  current = undefined;
});

async function app(handlers: Parameters<typeof buildTestApp>[0] = {}) {
  current = await buildTestApp(handlers);
  return current;
}

describe("POST /v1/channels/fake/inbound", () => {
  it("202 quando a mensagem é aceita", async () => {
    const { app: server } = await app();
    const res = await server.inject({ method: "POST", url: "/v1/channels/fake/inbound", payload: inbound });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ outcome: "accepted" });
  });

  it("200 quando a mensagem é duplicata", async () => {
    const { app: server } = await app({ inbound: async () => ({ outcome: "duplicate", messageId: "6f1c8a52-1d3e-4a4b-9a0e-2b4f0c9d7e11" }) });
    const res = await server.inject({ method: "POST", url: "/v1/channels/fake/inbound", payload: inbound });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ outcome: "duplicate", messageId: "6f1c8a52-1d3e-4a4b-9a0e-2b4f0c9d7e11" });
  });

  it("403 quando a fonte não está autorizada", async () => {
    const { app: server } = await app({ inbound: async () => ({ outcome: "rejected", reason: "not_authorized" }) });
    const res = await server.inject({ method: "POST", url: "/v1/channels/fake/inbound", payload: inbound });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "source.not_authorized" });
  });

  it("400 com o campo ausente quando o corpo viola o contrato", async () => {
    const { app: server } = await app();
    const { timestamp: _t, ...withoutTimestamp } = inbound;
    const res = await server.inject({ method: "POST", url: "/v1/channels/fake/inbound", payload: withoutTimestamp });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("contract.invalid");
  });

  it("400 quando o timestamp não tem fuso", async () => {
    const { app: server } = await app();
    const res = await server.inject({
      method: "POST",
      url: "/v1/channels/fake/inbound",
      payload: { ...inbound, timestamp: "2026-11-22T10:00:00" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("contract.invalid");
  });
});

describe("POST /v1/channels/fake/agent e outbox", () => {
  it("responde ao agente e registra a resposta no outbox", async () => {
    const { app: server } = await app();
    const res = await server.inject({
      method: "POST",
      url: "/v1/channels/fake/agent",
      payload: { senderAccountId: "fake-operator", text: "quem falou de Temporal?" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ text: "Não encontrei evidências suficientes.", outcome: "no_evidence", citations: [] });
    const outbox = await server.inject({ method: "GET", url: "/v1/channels/fake/outbox" });
    expect(outbox.json().items).toHaveLength(1);
    expect(outbox.json().items[0]).toMatchObject({ destinationAccountId: "fake-operator", rendered: "Não encontrei evidências suficientes." });
    expect((await server.inject({ method: "DELETE", url: "/v1/channels/fake/outbox" })).statusCode).toBe(204);
    expect((await server.inject({ method: "GET", url: "/v1/channels/fake/outbox" })).json().items).toEqual([]);
  });

  it("503 quando o agente falha", async () => {
    const { app: server } = await app({
      agent: async () => {
        throw new Error("banco fora do ar");
      },
    });
    const res = await server.inject({ method: "POST", url: "/v1/channels/fake/agent", payload: { senderAccountId: "x", text: "oi" } });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "agent.unavailable" });
  });
});

describe("GET /health", () => {
  it("200 com os checks", async () => {
    const { app: server } = await app();
    const res = await server.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", checks: { db: "ok", queue: "ok" } });
  });
});
