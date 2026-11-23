# PostgreSQL 16 com pgvector (ADR-0002). Extensões e esquema são criados pelas migrações da aplicação.
terraform {
  required_providers {
    docker = { source = "kreuzwerker/docker" }
  }
}

variable "name_prefix" { type = string }
variable "network_name" { type = string }
variable "image" {
  type    = string
  default = "pgvector/pgvector:0.8.7-pg16"
}
variable "database" {
  type    = string
  default = "palantir"
}
variable "username" {
  type    = string
  default = "palantir"
}
variable "password" {
  type      = string
  sensitive = true
}
variable "host_port" {
  type    = number
  default = 5432
}
variable "bind_ip" {
  type    = string
  default = "127.0.0.1"
}

resource "docker_image" "this" {
  name         = var.image
  keep_locally = true
}

resource "docker_volume" "data" {
  name = "${var.name_prefix}-postgres-data"
}

resource "docker_container" "this" {
  name    = "${var.name_prefix}-postgres"
  image   = docker_image.this.image_id
  restart = "unless-stopped"
  wait    = true

  env = [
    "POSTGRES_DB=${var.database}",
    "POSTGRES_USER=${var.username}",
    "POSTGRES_PASSWORD=${var.password}",
  ]

  ports {
    internal = 5432
    external = var.host_port
    ip       = var.bind_ip
  }

  volumes {
    volume_name    = docker_volume.data.name
    container_path = "/var/lib/postgresql/data"
  }

  networks_advanced {
    name    = var.network_name
    aliases = ["postgres"]
  }

  healthcheck {
    test     = ["CMD-SHELL", "pg_isready -U ${var.username} -d ${var.database}"]
    interval = "5s"
    timeout  = "5s"
    retries  = 20
  }
}

output "host_url" {
  description = "URL de conexão a partir da máquina local."
  value       = "postgres://${var.username}:${var.password}@localhost:${var.host_port}/${var.database}"
  sensitive   = true
}
