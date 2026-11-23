# ADR-0006: Ambiente local provisionado com Terraform e provider Docker

- Status: aceito
- Data: 2026-11-22
- Decisores: Leandro (produto), reversa-plan
- Origem: `_reversa_forward/001-walking-skeleton/roadmap.md` (D-18)

## Contexto

`requirements.md` exige IaC com Terraform e Local First. A v0.1 roda inteiramente na máquina do desenvolvedor.

## Decisão

- `infra/modules/{postgres,object-storage,observability}` descrevem cada serviço com o provider `kreuzwerker/docker`.
- `infra/local` compõe os módulos, gera credenciais locais com `random_password` e expõe outputs.
- `npm run setup` (`scripts/infra.mjs`) executa `terraform init` + `apply` e grava o `.env` com os outputs; `npm run teardown` executa `destroy`. O script encontra o Terraform no PATH ou em `C:\terraform` e usa o named pipe do Docker no Windows.
- Todas as portas ficam presas a `127.0.0.1`.

## Atualização 2026-11-23: SeaweedFS no lugar do MinIO

O PRD e o roadmap previam MinIO como object storage local. Em 2026-11-23 nenhuma imagem do MinIO estava disponível no Docker Hub nem no quay.io (a MinIO deixou de publicar imagens públicas da edição comunitária). O módulo `object-storage` usa **SeaweedFS** (`chrislusf/seaweedfs`, Apache 2.0) com a API S3 na porta 8333, credenciais geradas pelo Terraform e sem acesso anônimo. Como a aplicação fala S3, a migração futura para S3 (ou outro compatível) continua sem mudança de código.
- Os módulos são escritos para serem reaproveitados por uma raiz de nuvem futura.

## Consequências

- Positivas: o mesmo fluxo de IaC desde o primeiro dia; estado do ambiente explícito.
- Negativas: exige Docker e Terraform instalados; mais verboso que docker compose.

## Alternativas consideradas

- docker compose: não atende ao requisito de IaC com Terraform.
- Terraform chamando docker compose: o estado do Terraform não refletiria os containers.
