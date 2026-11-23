#!/usr/bin/env node
// Wrapper do Terraform do ambiente local (ADR-0006).
//   apply   → terraform init + apply em infra/local e grava .env com os outputs
//   destroy → terraform destroy
// Encontra o terraform no PATH ou em C:\terraform e usa o named pipe do Docker no Windows.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mergeEnv } from "./env-file.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = `${root}infra/local`;

function terraformBin() {
  const probe = spawnSync("terraform", ["version"], { stdio: "ignore" });
  if (!probe.error) return "terraform";
  for (const candidate of ["C:\\terraform\\terraform.exe", "/usr/local/bin/terraform"]) if (existsSync(candidate)) return candidate;
  console.error("Terraform não encontrado. Instale o Terraform ≥ 1.9 ou coloque-o no PATH (ver `npm run doctor`).");
  process.exit(1);
}

const env = { ...process.env };
if (process.platform === "win32" && !env.DOCKER_HOST) env.TF_VAR_docker_host = "npipe:////./pipe/docker_engine";

function tf(args, capture = false) {
  const r = spawnSync(terraformBin(), [`-chdir=${dir}`, ...args], {
    env,
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
  return r.stdout;
}

function writeEnv() {
  const out = JSON.parse(tf(["output", "-json"], true));
  const value = (k) => out[k]?.value ?? "";
  const example = readFileSync(`${root}.env.example`, "utf8");
  const content = example
    .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${value("database_url")}`)
    .replace(/^OTEL_EXPORTER_OTLP_ENDPOINT=.*$/m, `OTEL_EXPORTER_OTLP_ENDPOINT=${value("otlp_endpoint")}`)
    .concat(
      `\n# Gerado por npm run setup a partir dos outputs do Terraform. Não commitar.\n`,
      `S3_ENDPOINT=${value("s3_endpoint")}\nS3_BUCKET=${value("s3_bucket")}\n`,
      `S3_ACCESS_KEY=${value("s3_access_key")}\nS3_SECRET_KEY=${value("s3_secret_key")}\n`,
    );
  const previous = existsSync(`${root}.env`) ? readFileSync(`${root}.env`, "utf8") : "";
  writeFileSync(`${root}.env`, mergeEnv(content, previous));
  console.log(`\n.env gerado. Grafana: ${value("grafana_url")} (usuário admin, senha: terraform -chdir=infra/local output -raw grafana_admin_password)`);
}

const mode = process.argv[2];
if (mode === "apply") {
  tf(["init", "-input=false"]);
  tf(["apply", "-auto-approve", "-input=false"]);
  writeEnv();
} else if (mode === "destroy") {
  tf(["destroy", "-auto-approve", "-input=false"]);
} else {
  console.error("uso: node scripts/infra.mjs <apply|destroy>");
  process.exit(2);
}
