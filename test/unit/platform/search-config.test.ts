// T002 (feature 007): configuração da busca pelo sentido e do verificador (D-03, D-10; RN-05, RN-09).
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../../src/platform/config.js";

const base = { DATABASE_URL: "postgres://u:p@localhost:5432/db" };

function problemsOf(env: Record<string, string>): string {
  try {
    loadConfig({ ...base, ...env });
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as Error).message;
  }
  throw new Error("esperava ConfigError");
}

describe("configuração da busca pelo sentido", () => {
  it("sem configuração, o cálculo fica desligado e o verificador também (o setup grava o motor local no .env)", () => {
    const { search } = loadConfig(base);
    expect(search.embedder.engine).toBe("off");
    expect(search.embedder.url).toBe("http://127.0.0.1:8091");
    expect(search.embedder.dimensions).toBe(768);
    expect(search.embedder.allowRemote).toBe(false);
    expect(search.semanticMinSimilarity).toBeUndefined();
    expect(search.typoMinSimilarity).toBe(0.6);
    expect(search.verifier).toEqual({ engine: "off", allowRemote: false, apiKey: undefined, model: "jev-1.14.0", minProbability: 0.7 });
  });

  it("motor local com modelo, dimensão, prefixos e limiar do .env", () => {
    const { search } = loadConfig({
      ...base,
      PALANTIR_EMBEDDER: "openai-compatible",
      PALANTIR_EMBEDDER_MODEL: "BAAI/bge-m3",
      PALANTIR_EMBEDDER_DIMENSIONS: "1024",
      PALANTIR_EMBEDDER_QUERY_PREFIX: "query: ",
      PALANTIR_EMBEDDER_DOCUMENT_PREFIX: "passage: ",
      PALANTIR_SEMANTIC_MIN_SIMILARITY: "0.58",
    });
    expect(search.embedder).toMatchObject({ engine: "openai-compatible", model: "BAAI/bge-m3", dimensions: 1024, queryPrefix: "query: ", documentPrefix: "passage: " });
    expect(search.semanticMinSimilarity).toBe(0.58);
  });

  it("RN-05: serviço online só com a liberação explícita", () => {
    expect(problemsOf({ PALANTIR_EMBEDDER: "openai-compatible", PALANTIR_EMBEDDER_URL: "https://api.openai.com" })).toMatch(
      /PALANTIR_EMBEDDER_URL fora desta máquina exige PALANTIR_EMBEDDER_ALLOW_REMOTE=true/,
    );
    expect(problemsOf({ PALANTIR_EMBEDDER: "voyage" })).toMatch(/voyage exige PALANTIR_EMBEDDER_ALLOW_REMOTE=true/);
    const { search } = loadConfig({ ...base, PALANTIR_EMBEDDER: "voyage", PALANTIR_EMBEDDER_ALLOW_REMOTE: "true", PALANTIR_EMBEDDER_API_KEY: "k" });
    expect(search.embedder.url).toBe("https://ai.mongodb.com");
    expect(search.embedder.apiKey).toBe("k");
  });

  it("D-04: dimensão de 1 a 2.000; limiares entre 0 e 1; motor desconhecido recusado", () => {
    expect(problemsOf({ PALANTIR_EMBEDDER_DIMENSIONS: "3072" })).toMatch(/PALANTIR_EMBEDDER_DIMENSIONS deve ser inteiro entre 1 e 2000/);
    expect(problemsOf({ PALANTIR_SEMANTIC_MIN_SIMILARITY: "1.5" })).toMatch(/PALANTIR_SEMANTIC_MIN_SIMILARITY/);
    expect(problemsOf({ PALANTIR_EMBEDDER: "ollama" })).toMatch(/PALANTIR_EMBEDDER deve ser um de/);
  });

  it("RN-09: verificador TypeSafe exige liberação e chave, sem repetir a chave na mensagem", () => {
    const message = problemsOf({ PALANTIR_VERIFIER: "typesafe" });
    expect(message).toMatch(/PALANTIR_VERIFIER_ALLOW_REMOTE=true/);
    expect(message).toMatch(/TYPESAFE_API_KEY/);
    const { search } = loadConfig({ ...base, PALANTIR_VERIFIER: "typesafe", PALANTIR_VERIFIER_ALLOW_REMOTE: "true", TYPESAFE_API_KEY: "segredo" });
    expect(search.verifier.engine).toBe("typesafe");
    expect(problemsOf({ PALANTIR_VERIFIER: "typesafe", TYPESAFE_API_KEY: "segredo" })).not.toContain("segredo");
  });
});
