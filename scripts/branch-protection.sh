#!/usr/bin/env bash
# Aplica a DoR como proteção da branch main (RF-16): todos os jobs de .github/workflows/pr.yml
# obrigatórios, 1 aprovação de review, sem push direto nem force push.
# Uso: scripts/branch-protection.sh [owner/repo]   (requer `gh` autenticado com permissão de admin)
set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
CHECKS=(
  "static (tipos, lint, complexidade, arquitetura, contratos)"
  "unit (unitários, arquitetura, contrato)"
  "integration (PostgreSQL real)"
  "e2e (walking skeleton ponta a ponta)"
  "infra (Terraform do ambiente local, sem drift)"
  "mutation (≥ 60%)"
  "security (Semgrep, OSV-Scanner, gitleaks)"
)

contexts=$(printf '%s\n' "${CHECKS[@]}" | jq -R . | jq -s .)

jq -n --argjson contexts "$contexts" '{
  required_status_checks: { strict: true, contexts: $contexts },
  enforce_admins: true,
  required_pull_request_reviews: { required_approving_review_count: 1, dismiss_stale_reviews: true },
  restrictions: null,
  allow_force_pushes: false,
  allow_deletions: false,
  required_conversation_resolution: true
}' | gh api --method PUT "repos/${REPO}/branches/main/protection" --input - >/dev/null

echo "Proteção aplicada em ${REPO}@main: ${#CHECKS[@]} checks obrigatórios e 1 aprovação."
