// T003: o setup preserva as variáveis do WhatsApp e gera a chave da sessão só quando falta (RF-02 da S2).
import { describe, expect, it } from "vitest";
import { mergeEnv, parseEnv } from "../../../scripts/env-file.mjs";

const fixedKey = () => "K".repeat(43) + "=";

describe("parseEnv", () => {
  it("lê chave=valor e ignora comentários e linhas vazias", () => {
    expect(parseEnv("# x\nA=1\n\nB=dois=2\n")).toEqual({ A: "1", B: "dois=2" });
  });
});

describe("mergeEnv", () => {
  const generated = "PORT=8080\nPALANTIR_WHATSAPP_ENABLED=false\nPALANTIR_WA_SESSION_KEY=\n";

  it("gera a chave quando não há .env anterior", () => {
    expect(mergeEnv(generated, "", fixedKey)).toContain(`PALANTIR_WA_SESSION_KEY=${fixedKey()}`);
  });

  it("mantém a chave, o liga/desliga e a pasta do .env anterior", () => {
    const previous = "PALANTIR_WA_SESSION_KEY=ANTIGA\nPALANTIR_WHATSAPP_ENABLED=true\nPALANTIR_WA_SESSION_DIR=/x\nPORT=9999\n";
    const merged = mergeEnv(generated, previous, fixedKey);
    expect(merged).toContain("PALANTIR_WA_SESSION_KEY=ANTIGA");
    expect(merged).toContain("PALANTIR_WHATSAPP_ENABLED=true");
    expect(merged).toContain("PALANTIR_WA_SESSION_DIR=/x");
    expect(merged).toContain("PORT=8080");
  });

  it("mantém o modo de captura do .env anterior (feature 004, D-01)", () => {
    const merged = mergeEnv(`${generated}PALANTIR_WHATSAPP_CAPTURE=off\n`, "PALANTIR_WHATSAPP_CAPTURE=agent\n", fixedKey);
    expect(merged).toContain("PALANTIR_WHATSAPP_CAPTURE=agent");
    expect(merged).not.toContain("PALANTIR_WHATSAPP_CAPTURE=off");
  });

  it("gera a chave quando a anterior está vazia", () => {
    expect(mergeEnv(generated, "PALANTIR_WA_SESSION_KEY=\n", fixedKey)).toContain(`PALANTIR_WA_SESSION_KEY=${fixedKey()}`);
  });
});
