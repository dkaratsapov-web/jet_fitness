variable "cloud_id" {
  type        = string
  description = "Yandex Cloud ID (cloud-d-karatsapov)."
}

variable "folder_id" {
  type        = string
  description = "Yandex folder ID (default catalog)."
}

variable "zone" {
  type        = string
  default     = "ru-central1-a"
  description = "Default availability zone."
}

variable "pg_password" {
  type        = string
  sensitive   = true
  description = "Password for the PostgreSQL user 'jet'."
}

variable "pg_resource_preset" {
  type        = string
  default     = "b2.medium" # burstable 2 vCPU / 4 GB — cheapest, grant-friendly
  description = "Managed PostgreSQL host preset."
}

variable "pg_disk_size" {
  type        = number
  default     = 10
  description = "PostgreSQL disk size (GB)."
}

variable "app_bucket_name" {
  type        = string
  default     = "jet-fitness-app"
  description = "Object Storage bucket for the Mini App static (public read)."
}

variable "uploads_bucket_name" {
  type        = string
  default     = "jet-fitness-uploads"
  description = "Object Storage bucket for user uploads (private)."
}

variable "function_name" {
  type        = string
  default     = "jet-fitness-api"
  description = "Cloud Function name (autodeploy pushes versions to it)."
}
