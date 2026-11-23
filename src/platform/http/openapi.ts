// Leitura da especificação OpenAPI (API first, ADR-0004): as rotas usam os schemas daqui.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parse } from "yaml";

const require = createRequire(import.meta.url);

export interface OpenApiDocument {
  readonly paths: Record<string, Record<string, unknown>>;
  readonly components: { readonly schemas: Record<string, Record<string, unknown>> };
}

const SPEC_PATH = require.resolve("../../../contracts/openapi.yaml");
const AGENT_REPLY_REF = "./channel/agent-reply.schema.json";

let cached: OpenApiDocument | undefined;

export function loadOpenApi(): OpenApiDocument {
  cached ??= parse(readFileSync(SPEC_PATH, "utf8")) as OpenApiDocument;
  return cached;
}

/** Operações declaradas na spec, no formato "METHOD /path". */
export function declaredOperations(doc: OpenApiDocument = loadOpenApi()): string[] {
  const methods = ["get", "post", "put", "patch", "delete"];
  return Object.entries(doc.paths)
    .flatMap(([path, ops]) => Object.keys(ops).filter((m) => methods.includes(m)).map((m) => `${m.toUpperCase()} ${path}`))
    .sort();
}

/** Schema de um componente, com referências internas resolvidas, pronto para validação de rota. */
export function componentSchema(name: string, doc: OpenApiDocument = loadOpenApi()): Record<string, unknown> {
  const schema = doc.components.schemas[name];
  if (!schema) throw new Error(`Schema "${name}" não existe em contracts/openapi.yaml`);
  return resolveRefs(schema, doc) as Record<string, unknown>;
}

function resolveRefs(node: unknown, doc: OpenApiDocument): unknown {
  if (Array.isArray(node)) return node.map((n) => resolveRefs(n, doc));
  if (node === null || typeof node !== "object") return node;
  const record = node as Record<string, unknown>;
  const ref = record.$ref;
  if (typeof ref === "string") return resolveRef(ref, doc);
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, resolveRefs(v, doc)]));
}

function resolveRef(ref: string, doc: OpenApiDocument): unknown {
  if (ref === AGENT_REPLY_REF) {
    const { $schema: _s, $id: _i, ...schema } = require("../../../contracts/channel/agent-reply.schema.json") as Record<string, unknown>;
    return schema;
  }
  const local = /^#\/components\/schemas\/(.+)$/.exec(ref);
  if (local?.[1]) return componentSchema(local[1], doc);
  throw new Error(`Referência não suportada na OpenAPI: ${ref}`);
}
