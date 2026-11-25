# Motor local de embeddings (feature 007, D-02): Text Embeddings Inference em CPU, com a API /v1/embeddings
# compatível com a da OpenAI. Fica atrás da porta Embedder; trocar de motor é trocar este módulo e o adaptador,
# nunca o núcleo. Um modelo por container: o modelo vem do .env (PALANTIR_EMBEDDER_MODEL) pelo npm run setup.
terraform {
  required_providers {
    docker = { source = "kreuzwerker/docker" }
  }
}

variable "name_prefix" { type = string }
variable "network_name" { type = string }
variable "image" {
  type    = string
  default = "ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4"
}
variable "model_id" {
  type    = string
  default = "intfloat/multilingual-e5-base"
}
variable "host_port" {
  type    = number
  default = 8091
}
variable "bind_ip" {
  type    = string
  default = "127.0.0.1"
}
# O multilingual-e5-base mediu 4,7 GB no motor (ADR-0012); 6 GB deixa folga para o aquecimento.
variable "memory_mb" {
  type    = number
  default = 6144
}

resource "docker_image" "this" {
  name         = var.image
  keep_locally = true
}

resource "docker_volume" "models" {
  name = "${var.name_prefix}-embedder-models"
}

resource "docker_container" "this" {
  name    = "${var.name_prefix}-embedder"
  image   = docker_image.this.image_id
  restart = "unless-stopped"
  memory  = var.memory_mb
  # O Docker aplica 2× a memória como swap quando não é informado; explícito, o segundo plan não vê diferença.
  memory_swap = var.memory_mb * 2

  env = [
    "MODEL_ID=${var.model_id}",
    # Lotes do Palantír têm até 32 textos (interfaces/embedder-e-varredura.md §2).
    "MAX_CLIENT_BATCH_SIZE=32",
    # O padrão (16384 tokens) faz o aquecimento estourar a memória nos modelos de contexto longo (bge-m3, Qwen3); os
    # trechos têm até ~1.500 tokens. Texto mais longo é cortado em vez de derrubar o lote.
    "MAX_BATCH_TOKENS=2048",
    "AUTO_TRUNCATE=true",
  ]

  ports {
    internal = 80
    external = var.host_port
    ip       = var.bind_ip
  }

  volumes {
    volume_name    = docker_volume.models.name
    container_path = "/data"
  }

  networks_advanced {
    name    = var.network_name
    aliases = ["embedder"]
  }
}

output "url" {
  value = "http://${var.bind_ip}:${var.host_port}"
}

output "volume" {
  value = docker_volume.models.name
}

output "image" {
  value = var.image
}
