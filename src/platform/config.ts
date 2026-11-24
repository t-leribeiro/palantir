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

/** Mídia e transcrição (feature 005, D-02, D-05, D-08, D-09, D-12). */
export const MEDIA_STORE_KINDS = ["audio", "image", "document", "video"] as const;
export type StoredMediaKind = (typeof MEDIA_STORE_KINDS)[number];
export const TRANSCRIBER_ENGINES = ["openai-compatible", "fake"] as const;
export type TranscriberEngine = (typeof TRANSCRIBER_ENGINES)[number];

export interface StorageConfig {
  readonly endpoint: string | undefined;
  readonly bucket: string;
  readonly accessKey: string | undefined;
  readonly secretKey: string | undefined;
}

export interface TranscriptionConfig {
  /** `PALANTIR_TRANSCRIPTION=off`: o worker não assina a fila; os áudios ficam guardados e pendentes (RF-14). */
  readonly enabled: boolean;
  readonly engine: TranscriberEngine;
  readonly url: string;
  readonly model: string;
  /** RN-03: motor fora desta máquina só com liberação explícita, porque o áudio sai dela. */
  readonly allowRemote: boolean;
  readonly apiKey: string | undefined;
  readonly concurrency: number;
}

export interface MediaConfig {
  /** Tipos guardados (RN-10); os demais seguem só contados. Vazio = nenhum. */
  readonly storeKinds: readonly StoredMediaKind[];
  /** Chave AES-256 (32 bytes) dos objetos; o setup gera e preserva. */
  readonly key: Buffer | undefined;
  readonly storage: StorageConfig;
  readonly transcription: TranscriptionConfig;
}

export interface AppConfig {
  readonly role: Role;
  readonly httpPort: number;
  readonly databaseUrl: string;
  readonly otlpEndpoint: string | undefined;
  readonly fakeChannelEnabled: boolean;
  readonly lowConfidenceThreshold: number;
  readonly logLevel: "debug" | "info" | "warn" | "error";
  readonly whatsapp: WhatsAppConfig;
  readonly media: MediaConfig;
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
  const media = mediaConfig(env, problems);
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
    media,
  };
}

const SESSION_KEY_BYTES = 32;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function mediaConfig(env: Env, problems: string[]): MediaConfig {
  return {
    storeKinds: storeKinds(env.PALANTIR_MEDIA_STORE_KINDS ?? "audio", problems),
    key: keyFrom(env.PALANTIR_MEDIA_KEY, "PALANTIR_MEDIA_KEY", problems),
    storage: {
      endpoint: present(env, "S3_ENDPOINT"),
      bucket: present(env, "S3_BUCKET") ?? "palantir-media",
      accessKey: present(env, "S3_ACCESS_KEY"),
      secretKey: present(env, "S3_SECRET_KEY"),
    },
    transcription: transcriptionConfig(env, problems),
  };
}

/** Valor da variável, ou `undefined` quando ausente ou vazia. */
const present = (env: Env, name: string): string | undefined => env[name] || undefined;

function transcriptionConfig(env: Env, problems: string[]): TranscriptionConfig {
  const allowRemote = env.PALANTIR_TRANSCRIBER_ALLOW_REMOTE === "true";
  return {
    enabled: oneOf(env.PALANTIR_TRANSCRIPTION || "on", ["on", "off"] as const, "PALANTIR_TRANSCRIPTION", problems) === "on",
    engine: oneOf(env.PALANTIR_TRANSCRIBER || "openai-compatible", TRANSCRIBER_ENGINES, "PALANTIR_TRANSCRIBER", problems),
    url: transcriberUrl(env.PALANTIR_TRANSCRIBER_URL || "http://127.0.0.1:8090", allowRemote, problems),
    model: env.PALANTIR_TRANSCRIBER_MODEL || "Systran/faster-whisper-small",
    allowRemote,
    apiKey: env.PALANTIR_TRANSCRIBER_API_KEY || undefined,
    concurrency: integer(env.PALANTIR_TRANSCRIBE_CONCURRENCY ?? "1", "PALANTIR_TRANSCRIBE_CONCURRENCY", 1, 4, problems),
  };
}

function storeKinds(value: string, problems: string[]): StoredMediaKind[] {
  const kinds = value.split(",").map((k) => k.trim()).filter((k) => k !== "");
  const known = (k: string): k is StoredMediaKind => (MEDIA_STORE_KINDS as readonly string[]).includes(k);
  if (!kinds.every(known)) problems.push(`PALANTIR_MEDIA_STORE_KINDS aceita: ${MEDIA_STORE_KINDS.join(", ")}`);
  return [...new Set(kinds.filter(known))];
}

/** RN-03: nunca repete a URL na mensagem (pode conter credencial ou revelar o provedor). */
function transcriberUrl(value: string, allowRemote: boolean, problems: string[]): string {
  const url = URL.canParse(value) ? new URL(value) : undefined;
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    problems.push("PALANTIR_TRANSCRIBER_URL deve ser uma URL http(s)");
  } else if (!allowRemote && !LOOPBACK_HOSTS.has(url.hostname)) {
    problems.push("PALANTIR_TRANSCRIBER_URL fora desta máquina exige PALANTIR_TRANSCRIBER_ALLOW_REMOTE=true (o áudio sairia dela)");
  }
  return value;
}

function whatsappConfig(env: Env, problems: string[]): WhatsAppConfig {
  const enabled = env.PALANTIR_WHATSAPP_ENABLED === "true";
  const sessionKey = keyFrom(env.PALANTIR_WA_SESSION_KEY, "PALANTIR_WA_SESSION_KEY", problems);
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
function keyFrom(value: string | undefined, name: string, problems: string[]): Buffer | undefined {
  if (!value) return undefined;
  const key = Buffer.from(value, "base64");
  if (key.length === SESSION_KEY_BYTES) return key;
  problems.push(`${name} deve ter ${SESSION_KEY_BYTES} bytes em base64`);
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
