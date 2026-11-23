variable "scanner_image" {
  type = string
}
resource "google_service_account" "scanner" {
  account_id   = "incys-scanner"
  display_name = "INCYS malware scanner (no database or storage access)"
}
resource "google_cloud_run_v2_service" "scanner" {
  name                = "incys-scanner"
  location            = var.region
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"
  depends_on          = [google_project_service.apis]
  template {
    service_account                  = google_service_account.scanner.email
    max_instance_request_concurrency = 2
    timeout                          = "55s"
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      image = var.scanner_image
      ports {
        container_port = 8080
      }
      resources {
        limits = { cpu = "2", memory = "4Gi" }
        # Allow signature updates while an instance is alive. Zero minimum instances.
        cpu_idle = false
      }
      startup_probe {
        http_get {
          path = "/health"
        }
        period_seconds    = 10
        timeout_seconds   = 5
        failure_threshold = 24
      }
    }
  }
}
resource "google_cloud_run_v2_service_iam_member" "scanner_invoker" {
  name     = google_cloud_run_v2_service.scanner.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.application.email}"
}
output "scanner_url" {
  value = google_cloud_run_v2_service.scanner.uri
}
