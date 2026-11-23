# Deployment runbook

No infrastructure apply, live payment request or release publication has been performed. Use client-owned accounts and configure credentials through the deployment environment or Secret Manager, never in Git or chat.

The user enabled Blaze and authorized full GCP deployment. See the [INCYS Firebase guide](firebase-deployment.md) for the current stack and automated deployment procedure.

## Local review

Follow the root README. Review with synthetic data and the eight demo accounts. Confirm workflows against `delivery-status.md`; draft AI documents are not a signed acceptance specification. Before loading any live records, complete provider integration, security and acceptance checks below.

## GCP preparation

1. Select the client project, billing account, approved production domain and region (default `asia-south1`). Set an encrypted, access-controlled remote Terraform state backend. Terraform state contains database credentials; the `sensitive` flag does not remove secrets from state.
2. Copy `infra/gcp/terraform.tfvars.example` into a local ignored tfvars file. Set `TF_VAR_database_password` through a secret binding. Review HA, retention, monthly costs and the five-instance application limit with the client.
3. Provision the foundational resources before pushing the first image. For initial bootstrap only, target the Artifact Registry repository, SQL database/user and storage bucket, review the plan, and apply that plan. Follow with a complete plan/apply after the image and secrets exist. Do not leave the project running indefinitely on a targeted plan.
4. Add the PostgreSQL connection string to the existing Secret Manager secret named by `database_url_secret`. Example shape: `postgresql://incys_app:URL_ENCODED_PASSWORD@localhost/incys?host=/cloudsql/PROJECT:REGION:incys-postgres`. Use the actual instance connection name and URL-encode the password. Do not expose Cloud SQL to authorized public IP networks.
5. The migration job now runs `scripts/prepare-database.ts`, creating the schema as `incys_migrator` and provisioning the separate `incys_app` runtime role. Runtime cannot create schema objects, truncate tables, read migration metadata or update/delete protected clinical, audit and ledger history. Local PostgreSQL tests verify these restrictions. Use the separate runtime and migration Secret Manager bindings in the supplied Terraform.

## Identity

- Configure Firebase / Identity Platform in the same project, enable email/password, email verification and TOTP MFA, and add the approved web domains. Configure email templates, sender domain and password policy.
- The supplied INCYS web registration is in `config/firebase.web.json`; optional `NEXT_PUBLIC_FIREBASE_*` overrides are read at **image build time**. These are public application configuration. Server Firebase Admin uses workload Application Default Credentials and `FIREBASE_PROJECT_ID`; do not ship a service-account JSON key in the image. Analytics is not initialized.
- In production set `AUTH_MODE=firebase`, `DEMO_MODE=false`, `NODE_ENV=production`, and `APP_ORIGIN` to the exact external HTTPS origin, without a trailing slash.
- Create and verify the first administrator's Firebase identity, then run the operator-only command against the intended production database:

```bash
BOOTSTRAP_FIREBASE_UID=CLIENT_VERIFIED_UID node --import tsx scripts/bootstrap-admin.ts
```

The script requires `DATABASE_URL`, `FIREBASE_PROJECT_ID` and ADC, refuses mismatched existing identities, and refuses to run when an active administrator already exists. Sign in through the web login, enroll the authenticator and sign in again. Staff register/verify their own identities first, then an administrator grants the appropriate roles. Test MFA recovery with the designated identity administrator before launch; self-service second-factor recovery is not implemented.

## Image and infrastructure

Build from the repository root using the Dockerfile. The registered Firebase configuration is included by default; optional build arguments can override it. `cloudbuild.yaml` tags the image and deployment version with its unique Cloud Build ID. Review a full Terraform plan before applying it. The resulting service starts without demo sign-in. In an environment with an approved TLS inspection CA, pass its trust bundle as the optional BuildKit secret `build_ca`; it is mounted only during dependency installation and is not baked into the image. Do not disable certificate verification.

Run `incys-migrate` as a one-off Cloud Run job before routing users to the new revision. Migrations are transactional and tracked in `schema_migrations`; serialize deployment migrations. The finite `incys-worker` job processes at most 100 outbox events and 100 expired reservations per execution. The Scheduler resource starts **paused**. Unpause it only after migration and worker verification. Alert when the outbox backlog grows beyond the job's capacity.

The current Terraform grants the application access to the named secrets, Cloud SQL, its private bucket, Firebase identity reads and FCM delivery. It provisions an IAM-protected ClamAV HTTP scanner with its own unprivileged service identity. Only the application can invoke it. The optional private TCP scanner configuration remains available for an externally managed scanner. Uploaded documents fail closed if storage, scanning or fresh signatures are unavailable.

Terraform does not configure custom DNS/TLS routing, Cloud Armor/WAF, budget alerts, uptime checks or centralized alert destinations. Complete those in the client project. The provided SQL backup/PITR configuration must be validated with a restore drill; it is not evidence of a tested recovery objective.

## Payments

Create separate Razorpay test and live configurations. Map these existing Secret Manager names through `runtime_secrets`:

```hcl
runtime_secrets = {
  RAZORPAY_KEY_ID         = "incys-razorpay-key-id"
  RAZORPAY_KEY_SECRET     = "incys-razorpay-key-secret"
  RAZORPAY_WEBHOOK_SECRET = "incys-razorpay-webhook-secret"
}
```

Configure Razorpay to POST to `https://APP_DOMAIN/api/v1/payments/webhook` with `payment.captured` and `refund.processed` events. Raw-body HMAC verification is mandatory. Frontend payment success never grants access or marks an order paid; only verified server events do. Test duplicate, delayed, invalid and out-of-order events using provider test mode.

A full refund has a requester and a different staff approver. Provider timeouts leave an approved record for manual reconciliation; do not blindly retry external refunds. Late captures on cancelled references are recorded as unapplied receipts, shown in the finance workspace and refundable without changing inventory again. Pending provider orders require manual receipt reconciliation before stock can be safely released. Automated reconciliation, partial refunds, inspected returns, fee installments, GST invoices and vendor bank settlements remain open scope.

## Android release

Supply these build definitions using a local ignored JSON file with `--dart-define-from-file` or secure CI variables:

- `API_BASE_URL`: external HTTPS API origin.
- `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_PROJECT_ID`: Android Firebase configuration.

Register package ID and signing fingerprints in Firebase. Copy `mobile/android/key.properties.example` to `key.properties`, provide the client-owned upload key outside Git, then build `flutter build appbundle --release` with the definitions. Use a separate signing key and application identity for testing where appropriate. No release key, Play Console account or signed release AAB is included.

Validate registration/verification, interrupted sessions, bookings, class joining, assignments, quizzes, checkout callbacks and notification permissions on real devices. The native application does not yet provide staff/vendor workspaces or staff MFA recovery; these workflows use the web application. Legacy FCM registration-token APIs remain in use because the backend Admin SDK sends to registration tokens; migrate client and server together when adopting FID-based targeting.

## Release acceptance and operations

Use a staging database and test-mode providers. Replace all seed content with reviewed course names, fees, curricula, practitioner details, product evidence, contact details, institution branding and published policies. Confirm university recognition claims per programme rather than assuming blanket recognition.

Exercise the acceptance flows in `delivery-status.md`; run the automated checks; review accessibility, mobile layouts, document scanning and cross-account authorization; test backups and restoration; confirm alert ownership. Install TLS/HSTS and a full CSP suitable for the verified Firebase/Razorpay origins. Configure global rate limits/WAF in addition to application per-account throttles.

Track API 5xx, booking conflicts, webhook failures, unapplied receipts, provider-order age, outbox age, scanner failures, database connections and backup success. Logs deliberately omit clinical notes, passwords, raw files and payment secrets. Do not add these to telemetry.

For rollback, route traffic to the previous immutable image revision. Do not roll back schema by deleting production data. Forward-fix compatible schema or restore into a separate reviewed recovery environment. Apply and rehearse the client's retention and privacy-request process before closing access/erasure requests in the portal; a status response does not itself export or delete records.
