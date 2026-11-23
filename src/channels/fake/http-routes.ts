// Rotas HTTP do canal fake (interfaces/http-api.md). Só registradas com PALANTIR_FAKE_CHANNEL=true.
import type { FastifyPluginAsync } from "fastify";
import { componentSchema } from "../../platform/http/openapi.js";
import type { FakeAgentMessage, FakeChannel, FakeInbound } from "./fake-channel.js";

const BASE = "/v1/channels/fake";

export function fakeChannelRoutes(channel: FakeChannel): FastifyPluginAsync {
  return async (app) => {
    app.post<{ Body: FakeInbound }>(
      `${BASE}/inbound`,
      { schema: { body: componentSchema("FakeInboundRequest") } },
      async (request, reply) => {
        const result = await channel.receiveInbound(request.body);
        switch (result.outcome) {
          case "accepted":
            return reply.status(202).send({ outcome: "accepted", messageId: result.messageId });
          case "duplicate":
            return reply.status(200).send({ outcome: "duplicate", messageId: result.messageId });
          default:
            if (result.reason === "invalid") return reply.status(400).send({ error: "contract.invalid", details: result.details ?? [] });
            return reply.status(403).send({ error: "source.not_authorized" });
        }
      },
    );

    app.post<{ Body: FakeAgentMessage }>(
      `${BASE}/agent`,
      { schema: { body: componentSchema("FakeAgentRequest") } },
      async (request, reply) => {
        try {
          return reply.status(200).send(await channel.receiveAgentMessage(request.body));
        } catch (error) {
          app.log.error({ err: { name: (error as Error).name } }, "falha ao responder pergunta ao agente");
          return reply.status(503).send({ error: "agent.unavailable" });
        }
      },
    );

    app.get<{ Querystring: { limit?: number } }>(
      `${BASE}/outbox`,
      { schema: { querystring: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100, default: 20 } } } } },
      async (request) => ({
        items: channel.outbox(request.query.limit).map(({ destinationAccountId, reply, rendered, sentAt }) => ({
          destinationAccountId,
          reply,
          rendered,
          sentAt,
        })),
      }),
    );

    app.delete(`${BASE}/outbox`, async (_request, reply) => {
      channel.clearOutbox();
      return reply.status(204).send();
    });
  };
}
