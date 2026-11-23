#!/usr/bin/env bash
# Aplica a DoR como proteção da branch main (RF-16): todos os jobs de .github/workflows/pr.yml
# obrigatórios, PR obrigatório, sem push direto nem force push.
#
# Uso: [REQUIRED_APPROVALS=N] scripts/branch-protection.sh [owner/repo]
#   Requer `gh` autenticado com permissão de admin. REQUIRED_APPROVALS padrão: 0, porque o repositório
#   ainda tem um único colaborador e o GitHub não permite aprovar o próprio PR. Com um revisor no time,
#   rode com REQUIRED_APPROVALS=1 para cumprir o "code review aprovado" da DoR (decisão de 2026-11-23).
set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
APPROVALS="${REQUIRED_APPROVALS:-0}"
CHECKS=(
  "static (tipos, lint, complexidade, arquitetura, contratos)"
  "unit (unitários, arquitetura, contrato)"
  "integration (PostgreSQL real)"
  "e2e (walking skeleton ponta a ponta)"
  "infra (Terraform do ambiente local, sem drift)"
  "mutation (≥ 60%)"
  "security (Semgrep, OSV-Scanner, gitleaks)"
)

contexts=""
for check in "${CHECKS[@]}"; do
  contexts+="${contexts:+,}\"${check}\""
done

gh api --method PUT "repos/${REPO}/branches/main/protection" --input - >/dev/null <<JSON
{
  "required_status_checks": { "strict": true, "contexts": [${contexts}] },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": ${APPROVALS},
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON

echo "Proteção aplicada em ${REPO}@main: ${#CHECKS[@]} checks obrigatórios, PR obrigatório, ${APPROVALS} aprovação(ões)."
