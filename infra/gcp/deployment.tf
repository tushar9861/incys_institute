variable "migration_database_url_secret" {
  type    = string
  default = "incys-migration-database-url"
}
variable "identity_authorized_domains" {
  type    = list(string)
  default = ["incys-institute.web.app", "incys-institute.firebaseapp.com"]
}
variable "manage_identity" {
  type        = bool
  default     = false
  description = "Enable after inspecting/importing any existing Identity Platform config."
}
variable "scheduler_paused" {
  type    = bool
  default = true
}
variable "identity_mfa_state" {
  type    = string
  default = "ENABLED"
}
variable "identity_mfa_providers" {
  type    = list(string)
  default = []
}
resource "google_service_account" "migrations" {
  account_id   = "incys-migrations"
  display_name = "INCYS database migrations only"
}
resource "google_project_iam_member" "migration_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.migrations.email}"
}
resource "google_secret_manager_secret_iam_member" "migrations" {
  for_each  = toset([var.database_url_secret, var.migration_database_url_secret])
  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.migrations.email}"
}
resource "google_identity_platform_config" "authentication" {
  count              = var.manage_identity ? 1 : 0
  project            = var.project_id
  authorized_domains = var.identity_authorized_domains
  sign_in {
    email {
      enabled           = true
      password_required = true
    }
  }
  mfa {
    state             = var.identity_mfa_state
    enabled_providers = var.identity_mfa_providers
    provider_configs {
      state = "ENABLED"
      totp_provider_config {
        adjacent_intervals = 1
      }
    }
  }
  lifecycle {
    # Manage only INCYS-required settings; retain existing project policies.
    prevent_destroy = true
    ignore_changes = [
      autodelete_anonymous_users, blocking_functions, client, monitoring,
      multi_tenant, quota, sms_region_config,
      sign_in[0].anonymous, sign_in[0].phone_number,
      sign_in[0].allow_duplicate_emails, sign_in[0].email[0].password_required
    ]
  }
  depends_on = [google_project_service.apis]
}
