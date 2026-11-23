// RF-03 / RNF-05: cada regra de arquitetura tem uma fixture que viola e outra que respeita.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { cruise } from "dependency-cruiser";
import type { ICruiseResult, IForbiddenRuleType } from "dependency-cruiser";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const config = require("../../.dependency-cruiser.cjs") as { forbidden: IForbiddenRuleType[] };
const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));

async function violationsIn(caseDir: string): Promise<string[]> {
  const result = await cruise(
    ["src"],
    {
      baseDir: `${fixtures}${caseDir}`,
      validate: true,
      ruleSet: { forbidden: config.forbidden },
      tsPreCompilationDeps: true,
      doNotFollow: { path: "node_modules" },
    },
    { extensions: [".ts", ".js"] },
  );
  const output = result.output as ICruiseResult;
  return output.summary.violations.map((v) => v.rule.name);
}

const REQUIRED_RULES = [
  "core-no-channels",
  "domain-pure",
  "domain-no-packages",
  "application-no-infra",
  "module-public-api-only",
  "no-module-cycles",
  "whatsapp-lib-isolated",
] as const;

describe("regras de arquitetura (dependency-cruiser)", () => {
  it("declara as regras obrigatórias do ADR-0005", () => {
    const names = config.forbidden.map((r) => r.name);
    for (const rule of REQUIRED_RULES) expect(names).toContain(rule);
  });

  for (const rule of REQUIRED_RULES) {
    it(`${rule}: rejeita a fixture que viola a regra`, async () => {
      expect(await violationsIn(`${rule}/bad`)).toContain(rule);
    });

    it(`${rule}: aceita a fixture que respeita a regra`, async () => {
      expect(await violationsIn(`${rule}/good`)).not.toContain(rule);
    });
  }
});
