terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source = "hashicorp/google", version = "~> 7.0"
    }
  }
  backend "gcs" {}
}
provider "google" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}
variable "project_id" {
  type = string
}
variable "region" {
  type    = string
  default = "asia-south1"
}
variable "container_image" {
  type = string
}
variable "app_origin" {
  type = string
}
variable "database_url_secret" {
  type        = string
  description = "Name of an existing Secret Manager secret containing the PostgreSQL connection URL."
}
variable "database_password" {
  type      = string
  sensitive = true
}
variable "database_tier" {
  type    = string
  default = "db-custom-1-3840"
}
variable "availability_type" {
  type    = string
  default = "REGIONAL"
  validation {
    condition     = contains(["ZONAL", "REGIONAL"], var.availability_type)
    error_message = "Choose ZONAL for an explicitly accepted pilot recovery objective, or REGIONAL for HA."
  }
}
locals {
  services = toset(["run.googleapis.com", "sqladmin.googleapis.com", "secretmanager.googleapis.com", "artifactregistry.googleapis.com", "cloudscheduler.googleapis.com", "storage.googleapis.com", "identitytoolkit.googleapis.com", "firebase.googleapis.com", "firebasehosting.googleapis.com", "cloudbuild.googleapis.com", "logging.googleapis.com", "iam.googleapis.com", "cloudresourcemanager.googleapis.com"])
}
resource "google_project_service" "apis" {
  for_each           = local.services
  service            = each.key
  disable_on_destroy = false
}
resource "google_service_account" "application" {
  account_id   = "incys-application"
  display_name = "INCYS application runtime"
}
resource "google_project_iam_member" "sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.application.email}"
}
resource "google_secret_manager_secret_iam_member" "database" {
  project   = var.project_id
  secret_id = var.database_url_secret
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.application.email}"
}
resource "google_sql_database_instance" "database" {
  name                = "incys-postgres"
  database_version    = "POSTGRES_17"
  region              = var.region
  deletion_protection = true
  depends_on          = [google_project_service.apis]
  settings {
    edition                     = "ENTERPRISE"
    tier                        = var.database_tier
    availability_type           = var.availability_type
    disk_size                   = 20
    disk_autoresize             = true
    deletion_protection_enabled = true
    connector_enforcement       = "REQUIRED"
    ip_configuration {
      ipv4_enabled = true
      # No authorized networks. Connections require IAM-authorized Cloud SQL connectors.
    }
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "20:30"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 14
      }
    }
    maintenance_window {
      day          = 7
      hour         = 20
      update_track = "stable"
    }
  }
}
resource "google_sql_database" "application" {
  name     = "incys"
  instance = google_sql_database_instance.database.name
}
resource "google_sql_user" "application" {
  name     = "incys_migrator"
  instance = google_sql_database_instance.database.name
  password = var.database_password
}
resource "google_storage_bucket" "private" {
  name                        = "${var.project_id}-incys-private"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  versioning {
    enabled = true
  }
}
resource "google_storage_bucket_iam_member" "files" {
  bucket = google_storage_bucket.private.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.application.email}"
}
resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = "incys"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}
resource "google_cloud_run_v2_service" "application" {
  name                = "incys-platform"
  location            = var.region
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"
  depends_on          = [google_project_iam_member.sql_client, google_secret_manager_secret_iam_member.database, google_secret_manager_secret_iam_member.runtime]
  template {
    dynamic "vpc_access" {
      for_each = var.vpc_network == "" ? [] : [1]
      content {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = var.vpc_network
          subnetwork = var.vpc_subnetwork
        }
      }
    }
    service_account                  = google_service_account.application.email
    max_instance_request_concurrency = 40
    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.database.connection_name]
      }
    }
    containers {
      image = var.container_image
      ports {
        container_port = 8080
      }
      resources {
        limits = {
          cpu = "1", memory = "1Gi"
        }
        cpu_idle = true
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = var.database_url_secret
            version = "latest"
          }
        }
      }
      env {
        name  = "AUTH_MODE"
        value = "firebase"
      }
      env {
        name  = "DEMO_MODE"
        value = "false"
      }
      env {
        name  = "APP_ORIGIN"
        value = var.app_origin
      }
      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCS_PRIVATE_BUCKET"
        value = google_storage_bucket.private.name
      }
      env {
        name  = "CLAMAV_HOST"
        value = var.clamav_host
      }
      env {
        name  = "SCAN_SERVICE_URL"
        value = google_cloud_run_v2_service.scanner.uri
      }
      dynamic "env" {
        for_each = var.runtime_secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
      env {
        name  = "ALLOWED_ORIGINS"
        value = "${var.app_origin},https://${var.project_id}.firebaseapp.com"
      }
      startup_probe {
        http_get {
          path = "/api/v1/livez"
          port = 8080
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 10
      }
    }
  }
}
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.application.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
output "application_url" {
  value = google_cloud_run_v2_service.application.uri
}
output "sql_connection_name" {
  value = google_sql_database_instance.database.connection_name
}
output "private_bucket" {
  value = google_storage_bucket.private.name
}
