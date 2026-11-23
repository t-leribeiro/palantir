#!/usr/bin/env node
// Varredura de segredos nos arquivos staged (Security First). Falha fechada:
// sem gitleaks instalado, o commit é bloqueado com instrução de instalação.
import { spawnSync } from "node:child_process";

const probe = spawnSync("gitleaks", ["version"], { stdio: "ignore" });
if (probe.error || probe.status !== 0) {
  console.error(
    "gitleaks não encontrado: o commit foi bloqueado para não deixar segredos passarem.\n" +
      "Instale com `winget install Gitleaks.Gitleaks` (Windows) e rode `npm run doctor`.",
  );
  process.exit(1);
}

const scan = spawnSync("gitleaks", ["git", "--staged", "--no-banner", "--redact", "--exit-code", "1"], {
  stdio: "inherit",
});
process.exit(scan.status ?? 1);
