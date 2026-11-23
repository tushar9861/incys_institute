variable "runtime_secrets" {
  description = "Environment variable to existing Secret Manager secret name. Include RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET for checkout."
  type        = map(string)
  default = {
  }
}
variable "clamav_host" {
  description = "Private ClamAV host reachable through the configured VPC. Uploads fail closed until configured."
  type        = string
  default     = ""
}
variable "vpc_network" {
  type    = string
  default = ""
}
variable "vpc_subnetwork" {
  type    = string
  default = ""
}
resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each  = toset(values(var.runtime_secrets))
  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.application.email}"
}
resource "google_project_iam_member" "firebase_auth" {
  project = var.project_id
  role    = "roles/firebaseauth.viewer"
  member  = "serviceAccount:${google_service_account.application.email}"
}
resource "google_project_iam_member" "push" {
  project = var.project_id
  role    = "roles/firebasecloudmessaging.admin"
  member  = "serviceAccount:${google_service_account.application.email}"
}
resource "google_cloud_run_v2_job" "operations" {
  for_each            = toset(["worker", "migrate", "bootstrap-admin"])
  name                = "incys-${each.key}"
  location            = var.region
  deletion_protection = true
  depends_on          = [google_project_iam_member.sql_client, google_secret_manager_secret_iam_member.database, google_secret_manager_secret_iam_member.migrations, google_project_iam_member.migration_sql]
  template {
    task_count  = 1
    parallelism = 1
    template {
      service_account = each.key == "migrate" ? google_service_account.migrations.email : google_service_account.application.email
      timeout         = "300s"
      max_retries     = 1
      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.database.connection_name]
        }
      }
      containers {
        image   = var.container_image
        command = ["node", "--import", "tsx"]
        args    = [each.key == "migrate" ? "scripts/prepare-database.ts" : "scripts/${each.key}.ts"]
        resources {
          limits = {
            cpu = "1", memory = "512Mi"
          }
        }
        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = each.key == "migrate" ? var.migration_database_url_secret : var.database_url_secret
              version = "latest"
            }
          }
        }
        dynamic "env" {
          for_each = each.key == "migrate" ? [1] : []
          content {
            name = "RUNTIME_DATABASE_URL"
            value_source {
              secret_key_ref {
                secret  = var.database_url_secret
                version = "latest"
              }
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
          name  = "FIREBASE_PROJECT_ID"
          value = var.project_id
        }
      }
    }
  }
}
resource "google_service_account" "scheduler" {
  account_id   = "incys-scheduler"
  display_name = "INCYS scheduled job trigger"
}
resource "google_cloud_run_v2_job_iam_member" "worker_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.operations["worker"].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}
resource "google_cloud_scheduler_job" "worker" {
  name       = "incys-outbox-and-reservations"
  region     = var.region
  schedule   = "*/5 * * * *"
  time_zone  = "Asia/Kolkata"
  paused     = var.scheduler_paused
  depends_on = [google_project_service.apis, google_cloud_run_v2_job_iam_member.worker_invoker]
  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.operations["worker"].name}:run"
    oauth_token {
      service_account_email = google_service_account.scheduler.email
    }
  }
}
