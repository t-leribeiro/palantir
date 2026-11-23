# Observabilidade local (requirements.md): OTel Collector → Tempo (traces), Prometheus (métricas) e Loki (logs),
# visualizados no Grafana com datasources e dashboards provisionados.
terraform {
  required_providers {
    docker = { source = "kreuzwerker/docker" }
  }
}

variable "name_prefix" { type = string }
variable "network_name" { type = string }
variable "config_dir" {
  type        = string
  description = "Diretório com as configurações de cada serviço (infra/local/config)."
}
variable "grafana_admin_password" {
  type      = string
  sensitive = true
}
variable "bind_ip" {
  type    = string
  default = "127.0.0.1"
}
variable "images" {
  type = object({
    collector  = string
    prometheus = string
    tempo      = string
    loki       = string
    grafana    = string
  })
  default = {
    collector  = "otel/opentelemetry-collector-contrib:0.164.0"
    prometheus = "prom/prometheus:v3.15.1"
    tempo      = "grafana/tempo:2.10.10"
    loki       = "grafana/loki:3.6.20"
    grafana    = "grafana/grafana:12.4.15"
  }
}

locals {
  dashboards = fileset("${var.config_dir}/grafana/dashboards", "*.json")
}

resource "docker_image" "img" {
  for_each     = var.images
  name         = each.value
  keep_locally = true
}

resource "docker_volume" "data" {
  for_each = toset(["prometheus", "tempo", "loki", "grafana"])
  name     = "${var.name_prefix}-${each.key}-data"
}

resource "docker_container" "tempo" {
  name    = "${var.name_prefix}-tempo"
  image   = docker_image.img["tempo"].image_id
  restart = "unless-stopped"
  command = ["-config.file=/etc/tempo.yaml"]
  user    = "root"
  upload {
    file    = "/etc/tempo.yaml"
    content = file("${var.config_dir}/tempo/tempo.yaml")
  }
  volumes {
    volume_name    = docker_volume.data["tempo"].name
    container_path = "/var/tempo"
  }
  networks_advanced {
    name    = var.network_name
    aliases = ["tempo"]
  }
}

resource "docker_container" "loki" {
  name    = "${var.name_prefix}-loki"
  image   = docker_image.img["loki"].image_id
  restart = "unless-stopped"
  command = ["-config.file=/etc/loki/loki.yaml"]
  user    = "root"
  upload {
    file    = "/etc/loki/loki.yaml"
    content = file("${var.config_dir}/loki/loki.yaml")
  }
  volumes {
    volume_name    = docker_volume.data["loki"].name
    container_path = "/loki"
  }
  networks_advanced {
    name    = var.network_name
    aliases = ["loki"]
  }
}

resource "docker_container" "collector" {
  name    = "${var.name_prefix}-otel-collector"
  image   = docker_image.img["collector"].image_id
  restart = "unless-stopped"
  command = ["--config=/etc/otelcol/config.yaml"]
  upload {
    file    = "/etc/otelcol/config.yaml"
    content = file("${var.config_dir}/otel/collector.yaml")
  }
  ports {
    internal = 4317
    external = 4317
    ip       = var.bind_ip
  }
  ports {
    internal = 4318
    external = 4318
    ip       = var.bind_ip
  }
  networks_advanced {
    name    = var.network_name
    aliases = ["otel-collector"]
  }
  depends_on = [docker_container.tempo, docker_container.loki]
}

resource "docker_container" "prometheus" {
  name    = "${var.name_prefix}-prometheus"
  image   = docker_image.img["prometheus"].image_id
  restart = "unless-stopped"
  command = ["--config.file=/etc/prometheus/prometheus.yml", "--storage.tsdb.path=/prometheus", "--storage.tsdb.retention.time=7d"]
  upload {
    file    = "/etc/prometheus/prometheus.yml"
    content = file("${var.config_dir}/prometheus/prometheus.yml")
  }
  ports {
    internal = 9090
    external = 9090
    ip       = var.bind_ip
  }
  volumes {
    volume_name    = docker_volume.data["prometheus"].name
    container_path = "/prometheus"
  }
  networks_advanced {
    name    = var.network_name
    aliases = ["prometheus"]
  }
}

resource "docker_container" "grafana" {
  name    = "${var.name_prefix}-grafana"
  image   = docker_image.img["grafana"].image_id
  restart = "unless-stopped"
  env = [
    "GF_SECURITY_ADMIN_USER=admin",
    "GF_SECURITY_ADMIN_PASSWORD=${var.grafana_admin_password}",
    "GF_AUTH_ANONYMOUS_ENABLED=false",
    "GF_USERS_ALLOW_SIGN_UP=false",
    "GF_ANALYTICS_REPORTING_ENABLED=false",
  ]
  upload {
    file    = "/etc/grafana/provisioning/datasources/datasources.yaml"
    content = file("${var.config_dir}/grafana/provisioning/datasources/datasources.yaml")
  }
  upload {
    file    = "/etc/grafana/provisioning/dashboards/dashboards.yaml"
    content = file("${var.config_dir}/grafana/provisioning/dashboards/dashboards.yaml")
  }
  dynamic "upload" {
    for_each = local.dashboards
    content {
      file    = "/var/lib/grafana/dashboards/${upload.value}"
      content = file("${var.config_dir}/grafana/dashboards/${upload.value}")
    }
  }
  ports {
    internal = 3000
    external = 3000
    ip       = var.bind_ip
  }
  volumes {
    volume_name    = docker_volume.data["grafana"].name
    container_path = "/var/lib/grafana"
  }
  networks_advanced {
    name    = var.network_name
    aliases = ["grafana"]
  }
  depends_on = [docker_container.prometheus, docker_container.tempo, docker_container.loki]
}

output "grafana_url" {
  value = "http://localhost:3000"
}

output "otlp_endpoint" {
  value = "http://localhost:4318"
}
