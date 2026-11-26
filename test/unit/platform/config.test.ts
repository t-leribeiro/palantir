// T003: configuração do papel whatsapp (RF-02, RF-12 da S2; D-04, D-05).
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../../src/platform/config.js";

const base = { DATABASE_URL: "postgres://u:p@localhost:5432/db" };
const key = Buffer.alloc(32, 7).toString("base64");

describe("configuração do canal WhatsApp", () => {
  it("vem desligado por padrão, com pasta da sessão fora do repositório e health na 8081", () => {
    const config = loadConfig(base);
    expect(config.whatsapp).toEqual({
      enabled: false,
      sessionKey: undefined,
      sessionDir: join(homedir(), ".palantir", "whatsapp"),
      healthPort: 8081,
      capture: "off",
      burstMs: 2000,
    });
  });

  it("leva de textos do dono (feature 009): 2 s por padrão, 0 desliga, até 10 s", () => {
    expect(loadConfig({ ...base, PALANTIR_WHATSAPP_BURST_MS: "0" }).whatsapp.burstMs).toBe(0);
    expect(loadConfig({ ...base, PALANTIR_WHATSAPP_BURST_MS: "3000" }).whatsapp.burstMs).toBe(3000);
    expect(() => loadConfig({ ...base, PALANTIR_WHATSAPP_BURST_MS: "60000" })).toThrow(/PALANTIR_WHATSAPP_BURST_MS/);
  });

  it("modo de captura (feature 004, D-01): off por padrão, agent ou dedicated", () => {
    expect(loadConfig({ ...base, PALANTIR_WHATSAPP_CAPTURE: "agent" }).whatsapp.capture).toBe("agent");
    expect(loadConfig({ ...base, PALANTIR_WHATSAPP_CAPTURE: "dedicated" }).whatsapp.capture).toBe("dedicated");
    expect(loadConfig({ ...base, PALANTIR_WHATSAPP_CAPTURE: "" }).whatsapp.capture).toBe("off");
  });

  it("recusa modo de captura desconhecido, dizendo os valores aceitos", () => {
    expect(() => loadConfig({ ...base, PALANTIR_WHATSAPP_CAPTURE: "sim" })).toThrow(/PALANTIR_WHATSAPP_CAPTURE deve ser um de: off, agent, dedicated/);
  });

  it("aceita o papel whatsapp e lê a chave de 32 bytes em base64", () => {
    const config = loadConfig({ ...base, PALANTIR_ROLE: "whatsapp", PALANTIR_WHATSAPP_ENABLED: "true", PALANTIR_WA_SESSION_KEY: key });
    expect(config.role).toBe("whatsapp");
    expect(config.whatsapp.enabled).toBe(true);
    expect(config.whatsapp.sessionKey?.length).toBe(32);
  });

  it("exige a chave quando o canal está ligado", () => {
    expect(() => loadConfig({ ...base, PALANTIR_WHATSAPP_ENABLED: "true" })).toThrow(/PALANTIR_WA_SESSION_KEY/);
  });

  it("recusa chave com tamanho errado sem mostrar o valor", () => {
    const short = Buffer.alloc(16, 1).toString("base64");
    try {
      loadConfig({ ...base, PALANTIR_WA_SESSION_KEY: short });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).toMatch(/32 bytes/);
      expect((error as Error).message).not.toContain(short);
    }
  });

  it("aceita pasta e porta informadas", () => {
    const config = loadConfig({ ...base, PALANTIR_WA_SESSION_DIR: "/tmp/wa", PALANTIR_WHATSAPP_HEALTH_PORT: "9090" });
    expect(config.whatsapp.sessionDir).toBe("/tmp/wa");
    expect(config.whatsapp.healthPort).toBe(9090);
  });
});
