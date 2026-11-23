# Ambiente local do Palantír (ADR-0006). `npm run setup` aplica, `npm run teardown` destrói.
terraform {
  required_version = ">= 1.9"
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.9.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.8.0"
    }
  }
}

variable "docker_host" {
  type        = string
  default     = null
  description = "Endpoint do Docker. No Windows, scripts/infra.mjs passa npipe:////./pipe/docker_engine."
}

variable "name_prefix" {
  type    = string
  default = "palantir"
}

provider "docker" {
  host = var.docker_host
}

resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "random_password" "grafana" {
  length  = 24
  special = false
}

resource "random_password" "s3_secret" {
  length  = 40
  special = false
}

resource "random_string" "s3_access" {
  length  = 20
  special = false
  upper   = true
}

resource "docker_network" "palantir" {
  name = var.name_prefix
}

module "postgres" {
  source       = "../modules/postgres"
  name_prefix  = var.name_prefix
  network_name = docker_network.palantir.name
  password     = random_password.postgres.result
}

module "object_storage" {
  source       = "../modules/object-storage"
  name_prefix  = var.name_prefix
  network_name = docker_network.palantir.name
  access_key   = random_string.s3_access.result
  secret_key   = random_password.s3_secret.result
}

module "observability" {
  source                 = "../modules/observability"
  name_prefix            = var.name_prefix
  network_name           = docker_network.palantir.name
  config_dir             = "${path.module}/config"
  grafana_admin_password = random_password.grafana.result
}

output "database_url" {
  value     = module.postgres.host_url
  sensitive = true
}

output "s3_endpoint" {
  value = module.object_storage.endpoint
}

output "s3_bucket" {
  value = module.object_storage.bucket
}

output "s3_access_key" {
  value     = random_string.s3_access.result
  sensitive = true
}

output "s3_secret_key" {
  value     = random_password.s3_secret.result
  sensitive = true
}

output "otlp_endpoint" {
  value = module.observability.otlp_endpoint
}

output "grafana_url" {
  value = module.observability.grafana_url
}

output "grafana_admin_password" {
  value     = random_password.grafana.result
  sensitive = true
}
