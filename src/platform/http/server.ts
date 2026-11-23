// Servidor HTTP (D-04). A plataforma só monta o servidor; cada adaptador registra as próprias rotas.
import Fastify, {
  type FastifyBaseLogger,
  type FastifyError,
  type FastifyInstance,
  type FastifyPluginAsync,
} from "fastify";
import type { Logger } from "../logging/logger.js";
import { componentSchema } from "./openapi.js";

export type HealthChecks = () => Promise<Record<string, "ok" | "fail">>;

export interface HttpServerOptions {
  readonly health: HealthChecks;
  readonly logger?: Logger;
  /** Plugins de rotas (ex.: rotas do canal fake, registradas só quando habilitado). */
  readonly routes?: readonly FastifyPluginAsync[];
  /** Recebe cada rota registrada (usado pelo teste de conformidade com a OpenAPI). */
  readonly onRoute?: (method: string, url: string) => void;
}

const REQUEST_TIMEOUT_MS = 15_000;

export async function buildHttpServer(options: HttpServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    ...(options.logger ? { loggerInstance: options.logger as FastifyBaseLogger } : { logger: false }),
    requestTimeout: REQUEST_TIMEOUT_MS,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: "array", useDefaults: true } },
  });

  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const m of methods) if (m !== "HEAD") options.onRoute?.(m, route.url);
  });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.validation) {
      const details = error.validation.map((v) => ({ path: v.instancePath || "/", message: v.message ?? "inválido" }));
      return reply.status(400).send({ error: "contract.invalid", details });
    }
    app.log.error({ err: { name: error.name, code: error.code } }, "erro não tratado na rota");
    return reply.status(error.statusCode && error.statusCode < 500 ? error.statusCode : 500).send({ error: "internal" });
  });

  app.get(
    "/health",
    { schema: { response: { 200: componentSchema("Health"), 503: componentSchema("Health") } } },
    async (_request, reply) => {
      const checks = await options.health();
      const healthy = Object.values(checks).every((c) => c === "ok");
      return reply.status(healthy ? 200 : 503).send({ status: healthy ? "ok" : "degraded", checks });
    },
  );

  for (const plugin of options.routes ?? []) await app.register(plugin);
  await app.ready();
  return app;
}
