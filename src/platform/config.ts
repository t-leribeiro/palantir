// Configuração validada a partir de variáveis de ambiente (segredos só por env, RF-12 da spec).
import { homedir } from "node:os";
import { join } from "node:path";

export type Role = "api" | "worker" | "whatsapp";

/** Canal WhatsApp (feature 003, D-04 e D-05): processo próprio, sessão criptografada fora do repositório. */
export interface WhatsAppConfig {
  readonly enabled: boolean;
  /** Chave AES-256 (32 bytes) da sessão; obrigatória com o canal ligado. */
  readonly sessionKey: Buffer | undefined;
  readonly sessionDir: string;
  readonly healthPort: number;
  /** Captura de grupos (feature 004, D-01): `agent` usa o número do agente; `dedicated`, um segundo número. */
  readonly capture: CaptureMode;
}

export const CAPTURE_MODES = ["off", "agent", "dedicated"] as const;
export type CaptureMode = (typeof CAPTURE_MODES)[number];

export interface AppConfig {
  readonly role: Role;
  readonly httpPort: number;
  readonly databaseUrl: string;
  readonly otlpEndpoint: string | undefined;
  readonly fakeChannelEnabled: boolean;
  readonly lowConfidenceThreshold: number;
  readonly logLevel: "debug" | "info" | "warn" | "error";
  readonly whatsapp: WhatsAppConfig;
}

export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Configuração inválida:\n- ${problems.join("\n- ")}`);
    this.name = "ConfigError";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

export function loadConfig(env: Env = process.env): AppConfig {
  const problems: string[] = [];
  const role = oneOf(env.PALANTIR_ROLE ?? "api", ["api", "worker", "whatsapp"] as const, "PALANTIR_ROLE", problems);
  const logLevel = oneOf(env.LOG_LEVEL ?? "info", ["debug", "info", "warn", "error"] as const, "LOG_LEVEL", problems);
  const httpPort = integer(env.PORT ?? "8080", "PORT", 1, 65535, problems);
  const threshold = decimal(env.PALANTIR_LOW_CONFIDENCE_THRESHOLD ?? "0.5", "PALANTIR_LOW_CONFIDENCE_THRESHOLD", problems);
  const databaseUrl = env.DATABASE_URL ?? "";
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) problems.push("DATABASE_URL deve ser uma URL postgres://");
  const whatsapp = whatsappConfig(env, problems);
  if (problems.length > 0) throw new ConfigError(problems);
  return {
    role,
    httpPort,
    databaseUrl,
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined,
    fakeChannelEnabled: env.PALANTIR_FAKE_CHANNEL === "true",
    lowConfidenceThreshold: threshold,
    logLevel,
    whatsapp,
  };
}

const SESSION_KEY_BYTES = 32;

function whatsappConfig(env: Env, problems: string[]): WhatsAppConfig {
  const enabled = env.PALANTIR_WHATSAPP_ENABLED === "true";
  const sessionKey = sessionKeyFrom(env.PALANTIR_WA_SESSION_KEY, problems);
  if (enabled && !sessionKey && !env.PALANTIR_WA_SESSION_KEY) {
    problems.push("PALANTIR_WA_SESSION_KEY é obrigatória com PALANTIR_WHATSAPP_ENABLED=true (gere com npm run setup)");
  }
  return {
    enabled,
    sessionKey,
    sessionDir: env.PALANTIR_WA_SESSION_DIR || join(homedir(), ".palantir", "whatsapp"),
    healthPort: integer(env.PALANTIR_WHATSAPP_HEALTH_PORT ?? "8081", "PALANTIR_WHATSAPP_HEALTH_PORT", 1, 65535, problems),
    capture: oneOf(env.PALANTIR_WHATSAPP_CAPTURE || "off", CAPTURE_MODES, "PALANTIR_WHATSAPP_CAPTURE", problems),
  };
}

/** Nunca repete o valor da chave na mensagem de erro (segredo). */
function sessionKeyFrom(value: string | undefined, problems: string[]): Buffer | undefined {
  if (!value) return undefined;
  const key = Buffer.from(value, "base64");
  if (key.length === SESSION_KEY_BYTES) return key;
  problems.push(`PALANTIR_WA_SESSION_KEY deve ter ${SESSION_KEY_BYTES} bytes em base64`);
  return undefined;
}

function oneOf<T extends string>(value: string, allowed: readonly T[], name: string, problems: string[]): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  problems.push(`${name} deve ser um de: ${allowed.join(", ")}`);
  return allowed[0] as T;
}

function integer(value: string, name: string, min: number, max: number, problems: string[]): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) problems.push(`${name} deve ser inteiro entre ${min} e ${max}`);
  return n;
}

function decimal(value: string, name: string, problems: string[]): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) problems.push(`${name} deve ser um número entre 0 e 1`);
  return n;
}
