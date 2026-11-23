# Object storage compatível com S3 para áudios e documentos (bucket privado).
# SeaweedFS substitui o MinIO previsto no plano: a MinIO parou de publicar imagens públicas (ADR-0006).
terraform {
  required_providers {
    docker = { source = "kreuzwerker/docker" }
  }
}

variable "name_prefix" { type = string }
variable "network_name" { type = string }
variable "image" {
  type    = string
  default = "chrislusf/seaweedfs:4.52"
}
variable "access_key" { type = string }
variable "secret_key" {
  type      = string
  sensitive = true
}
variable "bucket" {
  type    = string
  default = "palantir-media"
}
variable "host_port" {
  type    = number
  default = 8333
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
  name = "${var.name_prefix}-object-storage-data"
}

resource "docker_container" "this" {
  name    = "${var.name_prefix}-object-storage"
  image   = docker_image.this.image_id
  restart = "unless-stopped"
  command = ["server", "-dir=/data", "-s3", "-s3.port=8333", "-s3.config=/etc/seaweedfs/s3.json"]

  # Credenciais S3 locais; sem acesso anônimo (bucket privado).
  upload {
    file = "/etc/seaweedfs/s3.json"
    content = jsonencode({
      identities = [{
        name        = "palantir"
        credentials = [{ accessKey = var.access_key, secretKey = var.secret_key }]
        actions     = ["Admin", "Read", "Write", "List", "Tagging"]
      }]
    })
  }

  ports {
    internal = 8333
    external = var.host_port
    ip       = var.bind_ip
  }

  volumes {
    volume_name    = docker_volume.data.name
    container_path = "/data"
  }

  networks_advanced {
    name    = var.network_name
    aliases = ["object-storage"]
  }
}

output "endpoint" {
  value = "http://localhost:${var.host_port}"
}

output "bucket" {
  value = var.bucket
}
