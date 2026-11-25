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

# Modelo de embeddings servido pelo motor local (feature 007): o npm run setup passa o do .env.
variable "embedder_model" {
  type    = string
  default = "intfloat/multilingual-e5-base"
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

module "transcriber" {
  source       = "../modules/transcriber"
  name_prefix  = var.name_prefix
  network_name = docker_network.palantir.name
}

module "embedder" {
  source       = "../modules/embedder"
  name_prefix  = var.name_prefix
  network_name = docker_network.palantir.name
  model_id     = var.embedder_model
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

output "transcriber_url" {
  value = module.transcriber.url
}

output "embedder_url" {
  value = module.embedder.url
}

output "embedder_volume" {
  value = module.embedder.volume
}

output "embedder_image" {
  value = module.embedder.image
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
