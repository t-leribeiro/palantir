# Motor de transcrição local (feature 005, D-07): Speaches (faster-whisper em CPU, API compatível com OpenAI).
# Fica atrás da porta Transcriber; trocar de motor é trocar este módulo e o adaptador, nunca o núcleo.
terraform {
  required_providers {
    docker = { source = "kreuzwerker/docker" }
  }
}

variable "name_prefix" { type = string }
variable "network_name" { type = string }
variable "image" {
  type    = string
  default = "ghcr.io/speaches-ai/speaches:0.8.3-cpu"
}
variable "host_port" {
  type    = number
  default = 8090
}
variable "bind_ip" {
  type    = string
  default = "127.0.0.1"
}
variable "memory_mb" {
  type    = number
  default = 4096
}

resource "docker_image" "this" {
  name         = var.image
  keep_locally = true
}

resource "docker_volume" "models" {
  name = "${var.name_prefix}-transcriber-models"
}

resource "docker_container" "this" {
  name    = "${var.name_prefix}-transcriber"
  image   = docker_image.this.image_id
  restart = "unless-stopped"
  memory  = var.memory_mb

  env = [
    "WHISPER__COMPUTE_TYPE=int8",
    "WHISPER__INFERENCE_DEVICE=cpu",
    "ENABLE_UI=false",
  ]

  ports {
    internal = 8000
    external = var.host_port
    ip       = var.bind_ip
  }

  volumes {
    volume_name    = docker_volume.models.name
    container_path = "/home/ubuntu/.cache/huggingface/hub"
  }

  networks_advanced {
    name    = var.network_name
    aliases = ["transcriber"]
  }
}

output "url" {
  value = "http://${var.bind_ip}:${var.host_port}"
}
