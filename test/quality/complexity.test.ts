// RF-04 / RNF-06: complexidade ciclomática ≤ 10 por função, exceção só com registro versionado.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { aggregate, check, moduleOf } from "../../scripts/complexity.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));
const eslint = new ESLint({ cwd: root });

async function complexityErrors(code: string): Promise<string[]> {
  // Caminho virtual dentro de src/ para aplicar a configuração real do projeto.
  const [result] = await eslint.lintText(code, { filePath: `${root}src/__fixture__.ts` });
  return (result?.messages ?? []).filter((m) => m.ruleId === "complexity").map((m) => m.message);
}

describe("gate de complexidade ciclomática", () => {
  const complex = readFileSync(`${fixtures}complexity-11.ts`, "utf8");

  it("reprova função com complexidade 11", async () => {
    const errors = await complexityErrors(complex);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("complexity of 11");
    expect(errors[0]).toContain("Maximum allowed is 10");
  });

  it("aprova função com complexidade 10", async () => {
    const ten = complex.replace('  if (n > 2) return "i";\n', "");
    expect(await complexityErrors(ten)).toEqual([]);
  });

  it("exige justificativa em qualquer eslint-disable", async () => {
    const [result] = await eslint.lintText(`// eslint-disable-next-line complexity\n${complex}`, {
      filePath: `${root}src/__fixture__.ts`,
    });
    const rules = (result?.messages ?? []).map((m) => m.ruleId);
    expect(rules).toContain("@eslint-community/eslint-comments/require-description");
  });

  it("aceita a desativação quando há registro em complexity-exceptions.json", () => {
    expect(check(`${fixtures}with-exception`)).toEqual([]);
  });

  it("reprova desativação sem registro correspondente", () => {
    const problems = check(`${fixtures}without-registry`);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("src/classify.ts:1");
  });

  it("reprova registro órfão, sem desativação no código", () => {
    expect(check(`${fixtures}orphan-registry`)).toEqual([
      "Registro sem desativação correspondente: src/other.ts → gone.",
    ]);
  });

  it("agrupa o relatório por módulo com média e máximo", () => {
    expect(moduleOf("src/modules/agent/application/ask.ts")).toBe("src/modules/agent");
    expect(moduleOf("src/platform/db/pool.ts")).toBe("src/platform");
    expect(
      aggregate([
        { file: "src/modules/agent/a.ts", complexity: 2 },
        { file: "src/modules/agent/b.ts", complexity: 5 },
        { file: "src/shared/c.ts", complexity: 1 },
      ]),
    ).toEqual([
      { module: "src/modules/agent", functions: 2, average: 3.5, max: 5 },
      { module: "src/shared", functions: 1, average: 1, max: 1 },
    ]);
  });
});
