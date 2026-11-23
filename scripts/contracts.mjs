#!/usr/bin/env node
// Gera os tipos TypeScript a partir dos JSON Schemas do canal (ADR-0004).
//   generate → escreve src/contracts/channel/generated.ts
//   check    → falha se o arquivo versionado diverge do que seria gerado (drift)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const root = new URL("..", import.meta.url);
const SCHEMAS = ["canonical-message", "agent-reply"];
const TARGET = fileURLToPath(new URL("src/contracts/channel/generated.ts", root));
const HEADER =
  "// ARQUIVO GERADO por `npm run contracts:generate` a partir de contracts/channel/*.schema.json.\n" +
  "// Não edite à mão: `npm run contracts:check` falha em caso de drift (ADR-0004).\n\n";

async function render() {
  const parts = [];
  for (const name of SCHEMAS) {
    const schema = stripConditionals(
      JSON.parse(readFileSync(new URL(`contracts/channel/${name}.schema.json`, root), "utf8")),
    );
    const ts = await compile(schema, schema.title, {
      bannerComment: "",
      additionalProperties: false,
      strictIndexSignatures: true,
      maxItems: -1,
      style: { singleQuote: false, semi: true, printWidth: 120 },
    });
    parts.push(ts.trim());
  }
  return `${HEADER}${parts.join("\n\n")}\n`;
}

// Regras condicionais (if/then, allOf) só valem na validação em tempo de execução (Ajv);
// para os tipos estáticos elas geram interseções com índice aberto, então são removidas.
function stripConditionals(node) {
  if (Array.isArray(node)) return node.map(stripConditionals);
  if (node === null || typeof node !== "object") return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (["allOf", "if", "then", "else"].includes(key)) continue;
    out[key] = stripConditionals(value);
  }
  return out;
}

const mode = process.argv[2];
const generated = await render();
if (mode === "generate") {
  writeFileSync(TARGET, generated);
  console.log(`gerado: ${TARGET}`);
} else if (mode === "check") {
  let current = "";
  try {
    current = readFileSync(TARGET, "utf8").replace(/\r\n/g, "\n");
  } catch {
    // arquivo ausente conta como drift
  }
  if (current !== generated) {
    console.error("contracts: src/contracts/channel/generated.ts diverge dos schemas. Rode `npm run contracts:generate`.");
    process.exit(1);
  }
  console.log("contracts: tipos em dia com os schemas.");
} else {
  console.error("uso: node scripts/contracts.mjs <generate|check>");
  process.exit(2);
}
