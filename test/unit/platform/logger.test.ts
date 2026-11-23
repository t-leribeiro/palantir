import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../../src/platform/logging/logger.js";

function capture() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _enc, done) {
      lines.push(String(chunk));
      done();
    },
  });
  return { lines, logger: createLogger({ destination, level: "debug" }) };
}

const SECRET_TEXT = "O Grafana Alloy centraliza a coleta de telemetria";

describe("logger", () => {
  it("emite JSON com nível textual e serviço", () => {
    const { lines, logger } = capture();
    logger.info({ messageId: "m-1" }, "mensagem ingerida");
    const entry = JSON.parse(lines[0] ?? "{}");
    expect(entry).toMatchObject({ level: "info", service: "palantir", messageId: "m-1", msg: "mensagem ingerida" });
  });

  it("nunca registra o texto das mensagens, das buscas ou das respostas", () => {
    const { lines, logger } = capture();
    logger.info({ text: SECRET_TEXT });
    logger.info({ message: { text: SECRET_TEXT } });
    logger.info({ evidence: { chunkText: SECRET_TEXT } });
    logger.info({ search: { query: "grafana alloy" } });
    logger.info({ req: { body: { text: SECRET_TEXT } } });
    const all = lines.join("\n");
    expect(all).not.toContain("Grafana Alloy");
    expect(all).not.toContain("grafana alloy");
    expect(all).toContain("[redacted]");
  });

  it("não registra credenciais", () => {
    const { lines, logger } = capture();
    logger.info({ config: { databaseUrl: "postgres://u:segredo@h/db" } });
    expect(lines.join("")).not.toContain("segredo");
  });
});
