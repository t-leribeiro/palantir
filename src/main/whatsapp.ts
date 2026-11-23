// npm run dev:whatsapp: processo do WhatsApp (feature 003, interfaces/cli-whatsapp.md; feature 004,
// interfaces/health-whatsapp.md). O QR Code vai direto para o terminal, nunca para o logger (dá acesso à conta).
// Captura: `agent` usa o número do agente; `dedicated` sobe um segundo número com sessão própria.
import { telemetry } from "./telemetry-bootstrap.js";
import QRCode from "qrcode";
import { createBaileysProvider } from "../channels/whatsapp/provider/baileys-provider.js";
import type { WhatsAppProvider } from "../channels/whatsapp/provider/provider.js";
import { createEncryptedFileStore } from "../channels/whatsapp/session/encrypted-file-store.js";
import { loadConfig } from "../platform/config.js";
import { createLogger } from "../platform/logging/logger.js";
import { buildWhatsApp } from "./compose.js";

const CAPTURE_SESSION_FILE = "capture-session.enc";

const config = loadConfig({ ...process.env, PALANTIR_ROLE: "whatsapp" });
const logger = createLogger({ level: config.logLevel, exportToOtel: Boolean(config.otlpEndpoint) });

if (!config.whatsapp.enabled || !config.whatsapp.sessionKey) {
  logger.info("canal WhatsApp desligado (PALANTIR_WHATSAPP_ENABLED=false); nada a fazer");
  await telemetry.shutdown();
  process.exit(0);
}

const { sessionDir, sessionKey, capture } = config.whatsapp;
const log = { info: (m: string) => logger.info(m), warn: (m: string) => logger.warn(m), error: (m: string) => logger.error(m) };

function showQr(provider: WhatsAppProvider, who: string): void {
  provider.onQr((qr) => {
    void QRCode.toString(qr, { type: "terminal", small: true }).then((art) => {
      process.stdout.write(`\nNúmero ${who}: leia este QR Code com o celular desse número:\nWhatsApp → Aparelhos conectados → Conectar um aparelho\n\n${art}\n`);
    });
  });
}

const provider = createBaileysProvider({
  store: createEncryptedFileStore({ dir: sessionDir, key: sessionKey }),
  log,
  acceptGroups: capture === "agent",
});
showQr(provider, "do AGENTE");

const captureProvider =
  capture === "dedicated"
    ? createBaileysProvider({ store: createEncryptedFileStore({ dir: sessionDir, key: sessionKey, fileName: CAPTURE_SESSION_FILE }), log, acceptGroups: true })
    : undefined;
if (captureProvider) showQr(captureProvider, "de CAPTURA");

const handle = await buildWhatsApp(config, { provider, logger, ...(captureProvider ? { captureProvider } : {}) });
await handle.server.listen({ port: config.whatsapp.healthPort, host: "127.0.0.1" });
logger.info({ port: config.whatsapp.healthPort }, "health do WhatsApp disponível em /health");

async function shutdown() {
  await handle.close();
  await telemetry.shutdown();
  process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
