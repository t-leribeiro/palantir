#!/usr/bin/env node
// Roda localmente os itens automáticos da DoR (RF-16) e imprime o resultado por item.
// O code review humano é o único item que fica fora (aplicado pela proteção da branch main).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const items = [
  ["Build (tipos)", ["run", "typecheck"]],
  ["Lint + complexidade ≤ 10", ["run", "lint"]],
  ["Exceções de complexidade registradas", ["run", "complexity:check"]],
  ["Testes de arquitetura (regras de dependência)", ["run", "arch"]],
  ["Contratos sem drift", ["run", "contracts:check"]],
  ["Testes unitários, arquitetura e contrato", ["test"]],
  ["Testes de integração", ["run", "test:integration"]],
  ["Testes ponta a ponta (E2E)", ["run", "test:e2e"]],
  ["Testes de mutação (≥ 60%)", ["run", "test:mutation"]],
  ["Segurança sem críticos ou altos", ["run", "security"]],
];

const results = [];
for (const [name, args] of items) {
  const started = Date.now();
  const r = spawnSync(npm, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", shell: process.platform === "win32" });
  const ok = r.status === 0;
  results.push({ name, ok, seconds: Math.round((Date.now() - started) / 100) / 10 });
  console.log(`${ok ? "ok    " : "FALHA "} ${name} (${results.at(-1).seconds}s)`);
  if (!ok) console.log(`       → rode \`npm ${args.join(" ")}\` para ver o detalhe`);
}

const failed = results.filter((r) => !r.ok).length;
console.log("\nCode review: verificado pela proteção da branch main (1 aprovação obrigatória).");
console.log(failed === 0 ? "DoR: todos os itens automáticos aprovados." : `DoR: ${failed} item(ns) reprovado(s).`);
process.exit(failed === 0 ? 0 : 1);
