# Jet Fitness — one-time Yandex Cloud infrastructure.
# Creates everything the autodeploy pipeline then updates:
#   network + subnet, service account (+ roles, keys), Object Storage buckets,
#   Managed PostgreSQL, the Cloud Function (placeholder version) and API Gateway.

# ── Network ──────────────────────────────────────────────────
resource "yandex_vpc_network" "this" {
  name = "jet-fitness-net"
}

resource "yandex_vpc_subnet" "this" {
  name           = "jet-fitness-subnet"
  zone           = var.zone
  network_id     = yandex_vpc_network.this.id
  v4_cidr_blocks = ["10.10.0.0/24"]
}

# ── Service account + roles ──────────────────────────────────
resource "yandex_iam_service_account" "app" {
  name        = "jet-fitness-sa"
  description = "Jet Fitness: functions, gateway, storage"
}

locals {
  sa_roles = [
    "serverless.functions.invoker", # API Gateway -> Function
    "storage.admin",                # create buckets + set public-read on the app bucket
    "logging.writer",               # function logs
  ]
}

resource "yandex_resourcemanager_folder_iam_member" "roles" {
  for_each  = toset(local.sa_roles)
  folder_id = var.folder_id
  role      = each.value
  member    = "serviceAccount:${yandex_iam_service_account.app.id}"
}

# Static key for S3 (Object Storage) access.
resource "yandex_iam_service_account_static_access_key" "s3" {
  service_account_id = yandex_iam_service_account.app.id
  description        = "Jet Fitness Object Storage key"
}

# Authorized key (JSON) for GitHub Actions (yc-actions).
resource "yandex_iam_service_account_key" "authorized" {
  service_account_id = yandex_iam_service_account.app.id
  description        = "Jet Fitness CI key"
  key_algorithm      = "RSA_2048"
}

# ── Object Storage buckets ───────────────────────────────────
resource "yandex_storage_bucket" "app" {
  bucket     = var.app_bucket_name
  access_key = yandex_iam_service_account_static_access_key.s3.access_key
  secret_key = yandex_iam_service_account_static_access_key.s3.secret_key

  anonymous_access_flags {
    read = true # Mini App static must be publicly readable
    list = false
  }

  depends_on = [yandex_resourcemanager_folder_iam_member.roles]
}

resource "yandex_storage_bucket" "uploads" {
  bucket     = var.uploads_bucket_name
  access_key = yandex_iam_service_account_static_access_key.s3.access_key
  secret_key = yandex_iam_service_account_static_access_key.s3.secret_key

  depends_on = [yandex_resourcemanager_folder_iam_member.roles]
}

# ── Managed PostgreSQL ───────────────────────────────────────
# Security group: allow the pooler (6432) and direct (5432) ports. Public IP is
# enabled so the Cloud Function (internet egress) and CI migrations can connect.
# Tighten the source CIDR later to your CI/office ranges.
resource "yandex_vpc_security_group" "pg" {
  name       = "jet-fitness-pg-sg"
  network_id = yandex_vpc_network.this.id

  ingress {
    protocol       = "TCP"
    description    = "PostgreSQL pooler + direct"
    port           = 6432
    v4_cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    protocol       = "TCP"
    description    = "PostgreSQL direct"
    port           = 5432
    v4_cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    protocol       = "ANY"
    description    = "Allow all egress"
    v4_cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "yandex_mdb_postgresql_cluster" "main" {
  name               = "jet-fitness-pg"
  environment        = "PRODUCTION"
  network_id         = yandex_vpc_network.this.id
  security_group_ids = [yandex_vpc_security_group.pg.id]

  config {
    version = "16"
    resources {
      resource_preset_id = var.pg_resource_preset
      disk_type_id       = "network-ssd"
      disk_size          = var.pg_disk_size
    }
    # Built-in connection pooler (port 6432). SESSION mode so Prisma's schema
    # engine (migrations / db push) and prepared statements work — Yandex MDB
    # does not expose a separate direct port externally.
    pooler_config {
      pooling_mode = "SESSION"
    }
  }

  host {
    zone             = var.zone
    subnet_id        = yandex_vpc_subnet.this.id
    assign_public_ip = true # so migrations can run from CI / your Mac
  }
}

resource "yandex_mdb_postgresql_user" "jet" {
  cluster_id = yandex_mdb_postgresql_cluster.main.id
  name       = "jet"
  password   = var.pg_password
  conn_limit = 50
}

resource "yandex_mdb_postgresql_database" "jet" {
  cluster_id = yandex_mdb_postgresql_cluster.main.id
  name       = "jet_fitness"
  owner      = yandex_mdb_postgresql_user.jet.name
}

# ── Cloud Function (placeholder version) ─────────────────────
data "archive_file" "placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/.build/placeholder.zip"
}

resource "yandex_function" "api" {
  name               = var.function_name
  runtime            = "nodejs18"
  entrypoint         = "index.handler"
  memory             = 512
  execution_timeout  = "30"
  service_account_id = yandex_iam_service_account.app.id
  user_hash          = data.archive_file.placeholder.output_base64sha256

  content {
    zip_filename = data.archive_file.placeholder.output_path
  }

  # The autodeploy pipeline replaces the code/version on every push; Terraform
  # must not fight it. It still owns the function's existence and identity.
  lifecycle {
    ignore_changes = [user_hash, content, entrypoint, runtime, environment]
  }
}

# Make the function invokable by the API Gateway service account.
resource "yandex_function_iam_binding" "invoker" {
  function_id = yandex_function.api.id
  role        = "serverless.functions.invoker"
  members     = ["serviceAccount:${yandex_iam_service_account.app.id}"]
}

# ── API Gateway ──────────────────────────────────────────────
resource "yandex_api_gateway" "main" {
  name = "jet-fitness-gw"

  spec = <<-EOT
    openapi: 3.0.0
    info:
      title: jet-fitness-api
      version: 1.0.0
    x-yc-apigateway:
      cors:
        origin: '*'
        methods: '*'
        allowedHeaders: '*'
    paths:
      /:
        x-yc-apigateway-any-method:
          x-yc-apigateway-integration:
            type: cloud_functions
            function_id: ${yandex_function.api.id}
            service_account_id: ${yandex_iam_service_account.app.id}
      /{proxy+}:
        x-yc-apigateway-any-method:
          parameters:
            - name: proxy
              in: path
              required: false
              schema:
                type: string
          x-yc-apigateway-integration:
            type: cloud_functions
            function_id: ${yandex_function.api.id}
            service_account_id: ${yandex_iam_service_account.app.id}
  EOT
}
