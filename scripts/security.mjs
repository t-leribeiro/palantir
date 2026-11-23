#!/usr/bin/env node
// Segurança da DoR: nenhum achado crítico ou alto (esclarecimento de 2026-11-22).
//   Semgrep (análise estática, via Docker), OSV-Scanner (dependências) e gitleaks (segredos).
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SEMGREP_IMAGE = "semgrep/semgrep:1.184.0";
mkdirSync(`${root}reports/security`, { recursive: true });

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false });
  return { missing: Boolean(r.error), status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

const scanners = [
  {
    name: "Semgrep (SAST)",
    exec: () =>
      run("docker", [
        "run", "--rm", "-v", `${root}:/src`, "-w", "/src", SEMGREP_IMAGE,
        "semgrep", "scan", "--config", "p/typescript", "--config", "p/nodejs", "--config", "p/secrets",
        "--severity", "ERROR", "--error", "--metrics", "off", "--json", "--output", "reports/security/semgrep.json",
        "--exclude", "node_modules", "--exclude", ".agents", "--exclude", ".claude", "src", "scripts",
      ]),
    hint: "Semgrep roda via Docker: instale e inicie o Docker Desktop.",
  },
  {
    name: "OSV-Scanner (dependências)",
    exec: () =>
      run("osv-scanner", ["scan", "source", "--lockfile", "package-lock.json", "--format", "json", "--output-file", "reports/security/osv.json"]),
    evaluate: () => osvHighOrCritical(),
    hint: "Instale o OSV-Scanner (Windows: scoop install osv-scanner).",
  },
  {
    name: "gitleaks (segredos)",
    exec: () => run("gitleaks", ["git", "--no-banner", "--redact", "--exit-code", "1", "--report-path", "reports/security/gitleaks.json"]),
    hint: "Instale o gitleaks (Windows: winget install Gitleaks.Gitleaks).",
  },
];

// OSV sai com código ≠ 0 para qualquer vulnerabilidade; a DoR bloqueia só CRITICAL e HIGH.
function osvHighOrCritical() {
  try {
    const report = JSON.parse(readFileSync(`${root}reports/security/osv.json`, "utf8"));
    const severities = (report.results ?? [])
      .flatMap((r) => r.packages ?? [])
      .flatMap((p) => p.groups ?? [])
      .map((g) => Number(g.max_severity ?? 0));
    return severities.filter((s) => s >= 7).length;
  } catch {
    return -1;
  }
}

let failed = 0;
for (const s of scanners) {
  const r = s.exec();
  if (r.missing) {
    failed += 1;
    console.log(`FALTA  ${s.name}: ferramenta não encontrada. ${s.hint}`);
    continue;
  }
  const blocking = s.evaluate ? s.evaluate() : r.status === 0 ? 0 : 1;
  const ok = blocking === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok    " : "FALHA "} ${s.name}${blocking > 0 && s.evaluate ? ` (${blocking} achado(s) crítico(s)/alto(s))` : ""}`);
  if (!ok && r.stderr.trim()) console.log(r.stderr.trim().split("\n").slice(-5).join("\n"));
}

console.log(failed === 0 ? "\nSegurança: nenhum achado crítico ou alto." : `\nSegurança: ${failed} verificação(ões) bloqueando a DoR. Relatórios em reports/security/.`);
process.exit(failed === 0 ? 0 : 1);
