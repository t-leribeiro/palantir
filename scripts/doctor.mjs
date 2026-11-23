#!/usr/bin/env node
// Verifica os pré-requisitos do ambiente local (onboarding.md, seção 1).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const REQUIRED_NODE_MAJOR = Number(readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim());

const checks = [
  {
    name: "Node.js",
    run: () => process.versions.node,
    ok: (v) => Number(v.split(".")[0]) === REQUIRED_NODE_MAJOR,
    hint: `Instale e ative pelo nvm: nvm install ${REQUIRED_NODE_MAJOR} && nvm use ${REQUIRED_NODE_MAJOR}`,
  },
  {
    name: "Docker",
    run: () => version("docker", ["version", "--format", "{{.Server.Version}}"]),
    ok: Boolean,
    hint: "Instale o Docker Desktop (com WSL2 no Windows) e deixe-o em execução.",
  },
  {
    name: "Terraform",
    run: () => version("terraform", ["version", "-json"], (out) => JSON.parse(out).terraform_version),
    ok: (v) => atLeast(v, [1, 9]),
    hint: "Instale o Terraform ≥ 1.9 (Windows: winget install Hashicorp.Terraform).",
  },
  {
    name: "gitleaks",
    run: () => version("gitleaks", ["version"]),
    ok: Boolean,
    hint: "Instale o gitleaks (Windows: winget install Gitleaks.Gitleaks).",
  },
  {
    name: "OSV-Scanner",
    run: () => version("osv-scanner", ["--version"], (out) => out.split("\n")[0]),
    ok: Boolean,
    hint: "Instale o OSV-Scanner (Windows: scoop install osv-scanner).",
  },
];

function version(cmd, args, parse = (out) => out.trim()) {
  try {
    const out = execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return parse(out.trim());
  } catch {
    return "";
  }
}

function atLeast(v, [major, minor]) {
  const [a = 0, b = 0] = String(v).split(".").map(Number);
  return a > major || (a === major && b >= minor);
}

let failed = 0;
for (const check of checks) {
  const found = check.run();
  const pass = Boolean(found) && check.ok(found);
  if (!pass) failed += 1;
  const status = pass ? "ok  " : "FALTA";
  console.log(`${status} ${check.name.padEnd(12)} ${found || "não encontrado"}`);
  if (!pass) console.log(`      → ${check.hint}`);
}

if (failed > 0) {
  console.log(`\n${failed} pré-requisito(s) pendente(s). Veja _reversa_forward/001-walking-skeleton/onboarding.md.`);
  process.exit(1);
}
console.log("\nAmbiente pronto.");
