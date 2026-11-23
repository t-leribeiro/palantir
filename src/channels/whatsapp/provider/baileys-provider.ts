// Provedor WhatsApp real (feature 003, ADR-0009). ÚNICO arquivo que importa a biblioteca não oficial
// (regra whatsapp-lib-isolated). Sessão no arquivo criptografado (D-05), QR pelo evento (D-15), estados e
// reconexão (D-14), opções conservadoras (D-16) e remetente por número ou LID (D-06).
import makeWASocket, {
  BufferJSON,
  DisconnectReason,
  initAuthCreds,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
  type WAMessage,
  type WAMessageKey,
} from "baileys";
import { SessionFileError, type EncryptedFileStore } from "../session/encrypted-file-store.js";
import { backoffMs, classifyContent, isIgnoredJid, phoneFromJid, textOf } from "./mapping.js";
import type { IncomingDirect, SessionState, WhatsAppProvider } from "./provider.js";

type Socket = ReturnType<typeof makeWASocket>;
type SocketLogger = NonNullable<Parameters<typeof makeWASocket>[0]["logger"]>;
type KeyType = keyof SignalDataTypeMap;
type StoredKeys = { [T in KeyType]?: Record<string, SignalDataTypeMap[T]> };

const SEND_TIMEOUT_MS = 30_000;

/** Log do provedor sem conteúdo: só mensagens fixas e nomes de erro (RNF de privacidade). */
export interface ProviderLog {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface PersistedAuthState {
  readonly state: AuthenticationState;
  readonly isNew: boolean;
  saveCreds(): void;
}

/** Credenciais e todas as chaves (inclusive `lid-mapping`) num snapshot salvo no arquivo criptografado. */
export async function createPersistedAuthState(store: EncryptedFileStore): Promise<PersistedAuthState> {
  const text = await store.load();
  const snapshot = text ? (JSON.parse(text, BufferJSON.reviver) as { creds: AuthenticationCreds; keys: StoredKeys }) : null;
  const creds = snapshot?.creds ?? initAuthCreds();
  const keys: StoredKeys = snapshot?.keys ?? {};
  const persist = () => store.save(JSON.stringify({ creds, keys }, BufferJSON.replacer));

  const state: AuthenticationState = {
    creds,
    keys: {
      get(type, ids) {
        const bucket = (keys[type] ?? {}) as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const id of ids) {
          const value = bucket[id];
          if (value === undefined) continue;
          out[id] = type === "app-state-sync-key" ? proto.Message.AppStateSyncKeyData.fromObject(value as object) : value;
        }
        return out as { [id: string]: SignalDataTypeMap[typeof type] };
      },
      set(data: SignalDataSet) {
        for (const [type, entries] of Object.entries(data) as [KeyType, Record<string, unknown> | undefined][]) {
          const bucket = (keys[type] ??= {}) as Record<string, unknown>;
          for (const [id, value] of Object.entries(entries ?? {})) {
            if (value === null || value === undefined) Reflect.deleteProperty(bucket, id);
            else bucket[id] = value;
          }
        }
        persist();
      },
    },
  };
  return { state, isNew: snapshot === null, saveCreds: persist };
}

/** Logger da biblioteca no nível `error`, descartando objetos (podem conter mensagens ou credenciais). */
function quietLogger(log: ProviderLog): SocketLogger {
  const silent = () => undefined;
  const logger: SocketLogger = {
    level: "error",
    child: () => logger,
    trace: silent,
    debug: silent,
    info: silent,
    warn: silent,
    error: (_obj: unknown, msg?: string) => log.error(`biblioteca do WhatsApp: ${typeof msg === "string" ? msg.slice(0, 120) : "erro"}`),
  };
  return logger;
}

function timestampOf(message: WAMessage): Date {
  const raw = message.messageTimestamp as number | { toNumber(): number } | null | undefined;
  const seconds = typeof raw === "number" ? raw : (raw?.toNumber() ?? Date.now() / 1000);
  return new Date(seconds * 1000);
}

function statusCodeOf(error: unknown): number | undefined {
  return (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("tempo de envio esgotado")), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export interface BaileysProviderOptions {
  readonly store: EncryptedFileStore;
  readonly log: ProviderLog;
}

export function createBaileysProvider(options: BaileysProviderOptions): WhatsAppProvider {
  const { store, log } = options;
  const qrListeners: ((qr: string) => void)[] = [];
  const stateListeners: ((state: SessionState, reason?: string) => void)[] = [];
  let onDirect: ((message: IncomingDirect) => Promise<void>) | undefined;
  let socket: Socket | undefined;
  let attempt = 0;
  let stopping = false;
  let retryTimer: NodeJS.Timeout | undefined;

  const emitState = (state: SessionState, reason?: string) => stateListeners.forEach((listener) => listener(state, reason));

  async function loadAuth(): Promise<PersistedAuthState> {
    try {
      return await createPersistedAuthState(store);
    } catch (error) {
      if (!(error instanceof SessionFileError)) throw error;
      log.warn(error.message);
      await store.remove();
      return createPersistedAuthState(store);
    }
  }

  async function resolvePhone(key: WAMessageKey): Promise<string | null> {
    const direct = phoneFromJid(key.remoteJid) ?? phoneFromJid(key.remoteJidAlt);
    if (direct || !key.remoteJid?.endsWith("@lid") || !socket) return direct;
    return phoneFromJid(await socket.signalRepository.lidMapping.getPNForLID(key.remoteJid));
  }

  async function toDirect(message: WAMessage): Promise<IncomingDirect | null> {
    const { key } = message;
    if (!key.remoteJid || key.fromMe || isIgnoredJid(key.remoteJid)) return null;
    const content = normalizeMessageContent(message.message) as Record<string, unknown> | undefined;
    const kind = classifyContent(content);
    if (kind === "ignore" || !key.id) return null;
    const text = kind === "text" ? textOf(content) : undefined;
    return {
      id: key.id,
      chatJid: key.remoteJid,
      senderPhone: await resolvePhone(key),
      kind,
      ...(text ? { text } : {}),
      sentAt: timestampOf(message),
      ...(message.pushName ? { senderName: message.pushName } : {}),
    };
  }

  async function onUpsert(update: { messages: WAMessage[]; type: string }): Promise<void> {
    if (update.type !== "notify" || !onDirect) return;
    for (const message of update.messages) {
      try {
        const direct = await toDirect(message);
        if (direct) await onDirect(direct);
      } catch (error) {
        log.error(`falha ao tratar mensagem recebida (${(error as Error).name})`);
      }
    }
  }

  async function onClose(error: unknown): Promise<void> {
    if (stopping) return;
    const code = statusCodeOf(error);
    if (code === DisconnectReason.loggedOut) {
      await store.remove();
      log.warn("o WhatsApp encerrou a sessão do número do agente: pareie de novo com npm run dev:whatsapp");
      emitState("logged_out", String(code));
      return;
    }
    emitState("reconnecting", String(code ?? "desconhecido"));
    const delay = code === DisconnectReason.restartRequired ? 0 : backoffMs(attempt);
    attempt += 1;
    retryTimer = setTimeout(() => void open(), delay);
  }

  async function open(): Promise<void> {
    const auth = await loadAuth();
    const logger = quietLogger(log);
    socket = makeWASocket({
      auth: { creds: auth.state.creds, keys: makeCacheableSignalKeyStore(auth.state.keys, logger) },
      logger,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldIgnoreJid: isIgnoredJid,
      getMessage: async () => undefined,
    });
    socket.ev.on("creds.update", auth.saveCreds);
    socket.ev.on("messages.upsert", (update) => void onUpsert(update));
    socket.ev.on("connection.update", (update) => {
      if (update.qr) {
        emitState("pairing");
        qrListeners.forEach((listener) => listener(update.qr as string));
      }
      if (update.connection === "open") {
        attempt = 0;
        log.info("WhatsApp conectado");
        emitState("connected");
      }
      if (update.connection === "close") void onClose(update.lastDisconnect?.error);
    });
  }

  return {
    async start() {
      stopping = false;
      await open();
    },
    async stop() {
      stopping = true;
      if (retryTimer) clearTimeout(retryTimer);
      await store.flush();
      socket?.end(undefined);
      socket = undefined;
    },
    onQr: (listener) => void qrListeners.push(listener),
    onState: (listener) => void stateListeners.push(listener),
    onDirectMessage(listener) {
      onDirect = listener;
    },
    async sendText(chatJid, text) {
      if (!socket) throw new Error("WhatsApp desconectado");
      await withTimeout(socket.sendMessage(chatJid, { text }), SEND_TIMEOUT_MS);
    },
  };
}
