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

describe("mergeEnv com mídia (feature 005, D-05)", () => {
  const generated = "PALANTIR_WA_SESSION_KEY=\nPALANTIR_MEDIA_KEY=\nPALANTIR_TRANSCRIBER_MODEL=Systran/faster-whisper-small\n";

  it("gera a chave de mídia quando falta, separada da chave da sessão", () => {
    let n = 0;
    const keys = () => `CHAVE${++n}`;
    const merged = parseEnv(mergeEnv(generated, "", keys));
    expect(merged.PALANTIR_MEDIA_KEY).toMatch(/^CHAVE\d$/);
    expect(merged.PALANTIR_WA_SESSION_KEY).toMatch(/^CHAVE\d$/);
    expect(merged.PALANTIR_MEDIA_KEY).not.toBe(merged.PALANTIR_WA_SESSION_KEY);
  });

  it("preserva a chave de mídia, o modelo escolhido, o liga/desliga e os tipos guardados", () => {
    const previous = [
      "PALANTIR_MEDIA_KEY=MIDIA",
      "PALANTIR_TRANSCRIBER_MODEL=Systran/faster-whisper-medium",
      "PALANTIR_TRANSCRIPTION=off",
      "PALANTIR_MEDIA_STORE_KINDS=audio,image",
      "PALANTIR_TRANSCRIBE_CONCURRENCY=2",
      "",
    ].join("\n");
    const merged = parseEnv(mergeEnv(generated, previous, fixedKey));
    expect(merged.PALANTIR_MEDIA_KEY).toBe("MIDIA");
    expect(merged.PALANTIR_TRANSCRIBER_MODEL).toBe("Systran/faster-whisper-medium");
    expect(merged.PALANTIR_TRANSCRIPTION).toBe("off");
    expect(merged.PALANTIR_MEDIA_STORE_KINDS).toBe("audio,image");
    expect(merged.PALANTIR_TRANSCRIBE_CONCURRENCY).toBe("2");
  });
});
