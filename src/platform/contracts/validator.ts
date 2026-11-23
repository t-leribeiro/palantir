// Validação em tempo de execução do contrato do canal (ADR-0004). Schemas compilados uma vez.
import { createRequire } from "node:module";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import addFormatsModule from "ajv-formats";
import type {
  AgentReply,
  CanonicalMessage,
  ContractViolation,
} from "../../contracts/channel/knowledge-channel.js";
import type { Result } from "../../shared/index.js";

const require = createRequire(import.meta.url);
const canonicalSchema = require("../../../contracts/channel/canonical-message.schema.json") as object;
const replySchema = require("../../../contracts/channel/agent-reply.schema.json") as object;

const SUPPORTED_MAJOR = 1;

export type ContractErrorCode = "contract.invalid" | "contract.version_unsupported";

export interface ContractError {
  readonly code: ContractErrorCode;
  readonly details: readonly ContractViolation[];
}

const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => Ajv2020;
const ajv = addFormats(new Ajv2020({ allErrors: true, strict: true, strictRequired: false }));
const validateMessage = ajv.compile<CanonicalMessage>(canonicalSchema);
const validateReply = ajv.compile<AgentReply>(replySchema);

export function validateCanonicalMessage(input: unknown): Result<CanonicalMessage, ContractError> {
  const version = majorVersion(input);
  if (version !== undefined && version !== SUPPORTED_MAJOR) {
    return {
      ok: false,
      error: {
        code: "contract.version_unsupported",
        details: [{ path: "/contractVersion", message: `versão maior ${version} não suportada (esperado ${SUPPORTED_MAJOR}.x)` }],
      },
    };
  }
  return run(validateMessage, input);
}

export function validateAgentReply(input: unknown): Result<AgentReply, ContractError> {
  return run(validateReply, input);
}

function run<T>(validate: ValidateFunction<T>, input: unknown): Result<T, ContractError> {
  if (validate(input)) return { ok: true, value: input };
  return { ok: false, error: { code: "contract.invalid", details: toViolations(validate.errors ?? []) } };
}

function majorVersion(input: unknown): number | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const version = (input as { contractVersion?: unknown }).contractVersion;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) return undefined;
  return Number(version.split(".")[0]);
}

function toViolations(errors: readonly ErrorObject[]): ContractViolation[] {
  const seen = new Set<string>();
  const out: ContractViolation[] = [];
  for (const e of errors) {
    if (e.keyword === "if") continue;
    const path = e.keyword === "required" ? `${e.instancePath}/${String(e.params.missingProperty)}` : e.instancePath || "/";
    const key = `${path}|${e.message ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, message: e.message ?? "inválido" });
  }
  return out;
}
