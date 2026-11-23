# INCYS Firebase and GCP deployment

The user enabled Blaze on 23 November 2026 and authorized the full platform architecture. Project access and linked Cloud Billing were verified. Publication and live acceptance must still be established by deployment results; a prepared configuration is not a live service.

## Architecture

| Component | Configuration |
| --- | --- |
| Firebase web app | `config/firebase.web.json`; public client configuration; no Analytics initialization |
| Hosting | `incys-institute.web.app` and `incys-institute.firebaseapp.com`, pinned Cloud Run rewrite |
| Website/API | `incys-platform`, Next.js on Cloud Run in `asia-south1` (Mumbai) |
| Database | PostgreSQL 17 on Cloud SQL, separate migration and restricted runtime accounts |
| Private documents | Private GCS bucket; bounded uploads scanned before storage |
| Scanner | IAM-protected `incys-scanner` Cloud Run service; ClamAV with signature updates; no database/storage permissions |
| Identity | Firebase/Identity Platform, verified email and staff/vendor TOTP |
| Operations | Cloud Run migration, bootstrap-admin and worker jobs; five-minute scheduler |
| Build and credentials | Cloud Build, Artifact Registry, Secret Manager and private versioned Terraform state |

The initial integration environment uses a zonal SQL instance (`db-custom-1-3840`, 20 GB). Set `TF_VAR_availability_type=REGIONAL` for HA. SQL incurs ongoing charges. The scanner has zero minimum instances, a two-instance limit, 2 CPU/4 GiB per instance and CPU allocation while an instance is alive for signature refresh. These limits are not a quoted budget or a tested recovery objective.

## Deploy

Use Node 24, Python 3, Terraform, Google Cloud CLI and installed npm dependencies. Authenticate using the account authorized to manage `incys-institute`:

```bash
gcloud auth login --update-adc
gcloud auth application-default set-quota-project incys-institute
npx -y firebase-tools@latest projects:list
npm run cloud:preflight
npm run cloud:deploy
```

Firebase CLI supports ADC; a separate Firebase login can also be used. `GCLOUD_BIN`, `TERRAFORM_BIN` and `FIREBASE_BIN` can select installed executable paths. The preflight verifies account access, project number `688961840489`, billing and ADC without provisioning anything. Never commit service-account keys, database credentials, OAuth tokens or provider secrets.

The deploy command creates regional database secrets without printing values, provisions the foundation, builds versioned application/scanner images, configures identity, applies the stack and executes migration and worker jobs. Existing authorized domains and unrelated identity settings are retained. Plans with deletions/replacements are refused. Hosting is published only after backend database readiness. Public live checks run before the scheduler resumes.

No demo accounts or synthetic catalogue are seeded in the deployed database. The migration job provisions `incys_app` for application data access while `incys_migrator` owns schema changes. Runtime cannot perform DDL/TRUNCATE, read migration metadata or modify protected clinical/audit/ledger history. Terraform state contains credentials; keep it private. State, plan files and `.deploy/` are excluded from Git/build uploads.

## First administrator and acceptance

Register and verify the designated administrator through the live app, then run:

```bash
gcloud run jobs execute incys-bootstrap-admin \
  --project=incys-institute --region=asia-south1 \
  --update-env-vars=BOOTSTRAP_FIREBASE_UID=VERIFIED_FIREBASE_UID --wait
npm run test:live
```

Bootstrap refuses once an active administrator exists. Enroll TOTP at sign-in before entering staff workspaces. An optional short-lived `INCYS_TEST_ID_TOKEN` environment variable enables a read-only authenticated smoke check. It must not be committed or logged.

The app calls the private scanner using a Google-signed identity token. The scanner returns a clean verdict only after the engine accepts the file and its loaded signatures are no older than 72 hours. Failed, incomplete or stale scans reject the upload. The scanner needs update connectivity and monitoring; local container tests do not establish deployed IAM or network behavior.

Configure Razorpay test credentials through `runtime_secrets` and verify signed webhooks, refunds and duplicate events before using live payments. Register the Android app separately and fetch its SDK configuration using the Firebase CLI; the supplied app ID is for the web application. Client-owned Android release signing is a separate requirement.

Complete the live acceptance flows in [delivery status](delivery-status.md), including account isolation, bookings, LMS, payments, uploads, notifications, mobile access and backup restoration. See [operations](deployment.md) and [validation](validation.md) for current limits and observed test results.
