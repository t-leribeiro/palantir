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

// Feature 007: o motor local de embeddings (informativo; não conta como pré-requisito, sobe com npm run setup).
await checkEmbedder();

async function checkEmbedder() {
  const env = readEnv();
  const engine = env.PALANTIR_EMBEDDER || "off";
  if (engine !== "openai-compatible") {
    console.log(`info  ${"Embeddings".padEnd(12)} ${engine} (busca pelo sentido ${engine === "off" ? "desligada" : "por serviço externo ou de teste"})`);
    return;
  }
  const url = (env.PALANTIR_EMBEDDER_URL || "http://127.0.0.1:8091").replace(/\/+$/, "");
  const served = await servedModel(url);
  console.log(embedderLine(url, served, env.PALANTIR_EMBEDDER_MODEL ?? ""));
}

async function servedModel(url) {
  try {
    const response = await globalThis.fetch(`${url}/info`, { signal: globalThis.AbortSignal.timeout(3_000) });
    return String((await response.json()).model_id ?? "");
  } catch {
    return undefined;
  }
}

function embedderLine(url, served, configured) {
  const label = "Embeddings".padEnd(12);
  if (served === undefined) return `info  ${label} motor não respondeu em ${url} → rode npm run setup (a busca segue só por palavra)`;
  if (served.toLowerCase() === configured.toLowerCase()) return `ok    ${label} ${served}`;
  return `info  ${label} ${served} (o .env pede ${configured}: rode npm run setup)`;
}

function readEnv() {
  try {
    return Object.fromEntries(
      readFileSync(new URL("../.env", import.meta.url), "utf8")
        .split(/\r?\n/)
        .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line))
        .filter(Boolean)
        .map((m) => [m[1], m[2].replace(/^"(.*)"$/, "$1")]),
    );
  } catch {
    return {};
  }
}

if (failed > 0) {
  console.log(`\n${failed} pré-requisito(s) pendente(s). Veja _reversa_forward/001-walking-skeleton/onboarding.md.`);
  process.exit(1);
}
console.log("\nAmbiente pronto.");
