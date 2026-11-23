#!/usr/bin/env node
// Gate e relatório de complexidade ciclomática (ADR-0005, RNF-06).
//   check  → toda desativação da regra `complexity` precisa de registro em
//            quality/complexity-exceptions.json (e vice-versa).
//   report → complexidade média e máxima por módulo, em reports/complexity.json.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCANNED_DIRS = ["src", "scripts", "test"];
const IGNORED = new Set(["node_modules", "fixtures", "dist", "coverage", "reports", ".stryker-tmp"]);
// Só comentários reais (linha começando com // ou /*), não strings que mencionam a diretiva.
const DISABLE_RE = /^\s*(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?\s+[^\n]*\bcomplexity\b/;

export function listSourceFiles(root, dirs = SCANNED_DIRS) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (IGNORED.has(name)) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(c|m)?[jt]s$/.test(name)) out.push(full);
    }
  };
  for (const d of dirs) {
    try {
      walk(join(root, d));
    } catch {
      // diretório ausente: nada a verificar
    }
  }
  return out;
}

export function findDisables(root, files) {
  const found = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (DISABLE_RE.test(line)) {
        found.push({ file: toPosix(relative(root, file)), line: i + 1, next: lines[i + 1] ?? "" });
      }
    });
  }
  return found;
}

export function validateExceptions(disables, exceptions) {
  const problems = [];
  for (const entry of exceptions) {
    for (const field of ["file", "function", "justification", "reviewer"]) {
      if (!entry[field] || String(entry[field]).trim() === "") {
        problems.push(`Registro incompleto em complexity-exceptions.json: campo "${field}" vazio (${entry.file ?? "?"}).`);
      }
    }
  }
  for (const d of disables) {
    const match = exceptions.find((e) => e.file === d.file && d.next.includes(e.function));
    if (!match) {
      problems.push(`${d.file}:${d.line} desativa "complexity" sem registro em quality/complexity-exceptions.json.`);
    }
  }
  for (const e of exceptions) {
    const used = disables.some((d) => d.file === e.file && d.next.includes(e.function));
    if (!used) problems.push(`Registro sem desativação correspondente: ${e.file} → ${e.function}.`);
  }
  return problems;
}

export function check(root = DEFAULT_ROOT) {
  const exceptions = JSON.parse(readFileSync(join(root, "quality", "complexity-exceptions.json"), "utf8")).exceptions;
  return validateExceptions(findDisables(root, listSourceFiles(root)), exceptions);
}

export function moduleOf(file) {
  const parts = toPosix(file).split("/");
  if (parts[0] === "src" && (parts[1] === "modules" || parts[1] === "channels")) return parts.slice(0, 3).join("/");
  return parts.slice(0, 2).join("/");
}

export function aggregate(entries) {
  const byModule = new Map();
  for (const { file, complexity } of entries) {
    const key = moduleOf(file);
    const list = byModule.get(key) ?? [];
    list.push(complexity);
    byModule.set(key, list);
  }
  return [...byModule.entries()]
    .map(([module, values]) => ({
      module,
      functions: values.length,
      average: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
      max: Math.max(...values),
    }))
    .sort((a, b) => a.module.localeCompare(b.module));
}

async function report(root = DEFAULT_ROOT) {
  const { ESLint } = await import("eslint");
  const eslint = new ESLint({ cwd: root, overrideConfig: { rules: { complexity: ["error", { max: 0 }] } } });
  const results = await eslint.lintFiles(["src/**/*.ts"]);
  const entries = [];
  for (const r of results) {
    for (const m of r.messages) {
      const value = m.ruleId === "complexity" ? /complexity of (\d+)/.exec(m.message) : null;
      if (value) entries.push({ file: toPosix(relative(root, r.filePath)), complexity: Number(value[1]) });
    }
  }
  const rows = aggregate(entries);
  mkdirSync(join(root, "reports"), { recursive: true });
  writeFileSync(join(root, "reports", "complexity.json"), JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
  console.log("Módulo".padEnd(36), "Funções".padStart(8), "Média".padStart(7), "Máx".padStart(5));
  for (const r of rows) console.log(r.module.padEnd(36), String(r.functions).padStart(8), String(r.average).padStart(7), String(r.max).padStart(5));
}

function toPosix(p) {
  return p.split(sep).join("/");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const mode = process.argv[2];
  if (mode === "check") {
    const problems = check();
    for (const p of problems) console.error(`complexity: ${p}`);
    process.exit(problems.length > 0 ? 1 : 0);
  } else if (mode === "report") {
    await report();
  } else {
    console.error("uso: node scripts/complexity.mjs <check|report>");
    process.exit(2);
  }
}
