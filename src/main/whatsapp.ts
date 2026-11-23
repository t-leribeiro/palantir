// npm run dev:whatsapp: processo do número do agente (feature 003, interfaces/cli-whatsapp.md).
// O QR Code vai direto para o terminal, nunca para o logger (dá acesso à conta, D-15).
import { telemetry } from "./telemetry-bootstrap.js";
import QRCode from "qrcode";
import { createBaileysProvider } from "../channels/whatsapp/provider/baileys-provider.js";
import { createEncryptedFileStore } from "../channels/whatsapp/session/encrypted-file-store.js";
import { loadConfig } from "../platform/config.js";
import { createLogger } from "../platform/logging/logger.js";
import { buildWhatsApp } from "./compose.js";

const config = loadConfig({ ...process.env, PALANTIR_ROLE: "whatsapp" });
const logger = createLogger({ level: config.logLevel, exportToOtel: Boolean(config.otlpEndpoint) });

if (!config.whatsapp.enabled || !config.whatsapp.sessionKey) {
  logger.info("canal WhatsApp desligado (PALANTIR_WHATSAPP_ENABLED=false); nada a fazer");
  await telemetry.shutdown();
  process.exit(0);
}

const store = createEncryptedFileStore({ dir: config.whatsapp.sessionDir, key: config.whatsapp.sessionKey });
const provider = createBaileysProvider({
  store,
  log: { info: (m) => logger.info(m), warn: (m) => logger.warn(m), error: (m) => logger.error(m) },
});

provider.onQr((qr) => {
  void QRCode.toString(qr, { type: "terminal", small: true }).then((art) => {
    process.stdout.write(
      `\nLeia este QR Code com o celular do número do agente:\nWhatsApp → Configurações → Dispositivos conectados → Conectar dispositivo\n\n${art}\n`,
    );
  });
});

const handle = await buildWhatsApp(config, { provider, logger });
await handle.server.listen({ port: config.whatsapp.healthPort, host: "127.0.0.1" });
logger.info({ port: config.whatsapp.healthPort }, "health do WhatsApp disponível em /health");

async function shutdown() {
  await handle.close();
  await telemetry.shutdown();
  process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
