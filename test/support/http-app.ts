import type { FastifyInstance } from "fastify";
import { createFakeChannel, fakeChannelRoutes, type FakeChannel } from "../../src/channels/fake/index.js";
import type { AgentHandler, InboundHandler } from "../../src/contracts/channel/knowledge-channel.js";
import { buildHttpServer } from "../../src/platform/http/server.js";

export interface TestApp {
  app: FastifyInstance;
  channel: FakeChannel;
  routes: string[];
}

/** API do esqueleto com o canal fake e handlers substituíveis (sem banco). */
export async function buildTestApp(handlers: { inbound?: InboundHandler; agent?: AgentHandler } = {}): Promise<TestApp> {
  const channel = createFakeChannel({ conversations: [{ conversationId: "fake-group-1", title: "Grupo de teste", kind: "group" }] });
  channel.onMessage(handlers.inbound ?? (async (m) => ({ outcome: "accepted", messageId: m.id })));
  channel.onAgentMessage(handlers.agent ?? (async () => ({ text: "Não encontrei evidências suficientes.", outcome: "no_evidence", citations: [] })));
  await channel.connect();
  const routes: string[] = [];
  const app = await buildHttpServer({
    health: async () => ({ db: "ok", queue: "ok" }),
    routes: [fakeChannelRoutes(channel)],
    onRoute: (method, url) => routes.push(`${method} ${url}`),
  });
  return { app, channel, routes };
}
