# Values you feed into GitHub secrets (infra/yandex/SECRETS.md) and BotFather.
# Sensitive outputs are hidden by default; read them with:
#   terraform output -raw database_url
#   terraform output -raw yc_sa_json

output "api_gateway_url" {
  value       = "https://${yandex_api_gateway.main.domain}"
  description = "API_GATEWAY_URL secret + VITE_API_URL for the Mini App."
}

output "database_url" {
  sensitive   = true
  description = "DATABASE_URL secret (pooler port 6432)."
  value = format(
    "postgresql://jet:%s@%s:6432/jet_fitness?sslmode=require&connection_limit=5",
    var.pg_password,
    yandex_mdb_postgresql_cluster.main.host[0].fqdn,
  )
}

output "s3_key" {
  sensitive   = true
  value       = yandex_iam_service_account_static_access_key.s3.access_key
  description = "S3_KEY secret."
}

output "s3_secret" {
  sensitive   = true
  value       = yandex_iam_service_account_static_access_key.s3.secret_key
  description = "S3_SECRET secret."
}

output "yc_sa_json" {
  sensitive   = true
  description = "YC_SA_JSON_CREDENTIALS secret (paste the whole JSON)."
  value = jsonencode({
    id                 = yandex_iam_service_account_key.authorized.id
    service_account_id = yandex_iam_service_account.app.id
    key_algorithm      = "RSA_2048"
    public_key         = yandex_iam_service_account_key.authorized.public_key
    private_key        = yandex_iam_service_account_key.authorized.private_key
  })
}

output "app_bucket" {
  value       = yandex_storage_bucket.app.bucket
  description = "S3_APP_BUCKET secret."
}

output "uploads_bucket" {
  value       = yandex_storage_bucket.uploads.bucket
  description = "S3_UPLOADS_BUCKET secret."
}

output "miniapp_url" {
  value       = "https://storage.yandexcloud.net/${yandex_storage_bucket.app.bucket}/index.html"
  description = "Mini App URL — set as the Web App URL in BotFather."
}

output "pg_host" {
  value       = yandex_mdb_postgresql_cluster.main.host[0].fqdn
  description = "PostgreSQL host FQDN (for manual migrations)."
}

output "network_id" {
  value       = yandex_vpc_network.this.id
  description = "YC_NETWORK_ID secret — attaches the function for a static egress IP (FatSecret whitelist)."
}
