// Configuração validada a partir de variáveis de ambiente (segredos só por env, RF-12 da spec).
export type Role = "api" | "worker";

export interface AppConfig {
  readonly role: Role;
  readonly httpPort: number;
  readonly databaseUrl: string;
  readonly otlpEndpoint: string | undefined;
  readonly fakeChannelEnabled: boolean;
  readonly lowConfidenceThreshold: number;
  readonly logLevel: "debug" | "info" | "warn" | "error";
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
  const role = oneOf(env.PALANTIR_ROLE ?? "api", ["api", "worker"] as const, "PALANTIR_ROLE", problems);
  const logLevel = oneOf(env.LOG_LEVEL ?? "info", ["debug", "info", "warn", "error"] as const, "LOG_LEVEL", problems);
  const httpPort = integer(env.PORT ?? "8080", "PORT", 1, 65535, problems);
  const threshold = decimal(env.PALANTIR_LOW_CONFIDENCE_THRESHOLD ?? "0.5", "PALANTIR_LOW_CONFIDENCE_THRESHOLD", problems);
  const databaseUrl = env.DATABASE_URL ?? "";
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) problems.push("DATABASE_URL deve ser uma URL postgres://");
  if (problems.length > 0) throw new ConfigError(problems);
  return {
    role,
    httpPort,
    databaseUrl,
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined,
    fakeChannelEnabled: env.PALANTIR_FAKE_CHANNEL === "true",
    lowConfidenceThreshold: threshold,
    logLevel,
  };
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
