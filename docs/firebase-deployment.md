# INCYS Firebase deployment

Status on 23 November 2026: configuration prepared and tested locally; **not deployed**. The user selected **Spark**, so paid infrastructure deployment is paused. `config/deployment.json` records this constraint and the deployment command refuses `--apply` while it remains Spark. There is also no authenticated deployment identity in this workspace.

## Spark compatibility

Spark supports Firebase Hosting for static assets, basic Firebase Authentication, and limited Firestore/Realtime Database usage. It cannot run this project's Next server/API on Cloud Run or provision the planned regular Cloud SQL instance. The existing relational schema and transaction code do not automatically use Firestore when a Firebase project is configured.

Cloud Functions, Firebase App Hosting, Cloud Run, Cloud Build, Artifact Registry and Secret Manager require billing. Cloud Storage for Firebase now requires Blaze, including the registered `incys-institute.firebasestorage.app` bucket. Its appearance in the web configuration is not evidence that it has been provisioned or is writable. SMS verification also requires Blaze. TOTP is distinct from SMS and requires Identity Platform configuration; basic email/password sign-in remains available on Spark.

Firebase SQL Connect offers a constrained 90-day Spark database trial. This is not the ordinary Cloud SQL deployment defined in this repository, does not host the Next API, and would require a separately designed integration. It is not an indefinite free production database.

Staying entirely on Spark requires a reduced static/client application and redesigned database access with Security Rules. Keeping the full current backend requires a separately hosted server and PostgreSQL, or a later explicitly authorized move to Blaze. Do not put payment keys, administrative role assignment or trusted payment confirmation into browser code to bypass this limitation.

Sources checked on 23 November 2026: [Firebase pricing](https://firebase.google.com/pricing), [pricing-plan behavior](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [Storage billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024), [SQL Connect trial](https://firebase.google.com/docs/sql-connect/pricing), [Authentication limits](https://firebase.google.com/docs/auth/limits).

## Prepared architecture — requires a future Blaze decision

| Component | Prepared configuration |
| --- | --- |
| Public web registration | `config/firebase.web.json`, exactly the client-supplied app; no Analytics initialization |
| Hosting | `incys-institute.web.app` and `incys-institute.firebaseapp.com`; rewrite to pinned Cloud Run revision |
| Server/API | `incys-platform`, Cloud Run, `asia-south1` (Mumbai) |
| Database | PostgreSQL 17, Cloud SQL, separate migration and restricted runtime roles |
| Documents | Private GCS bucket; uploads fail closed until a private malware scanner is configured |
| Authentication | Firebase/Identity Platform email/password, verified email and staff/vendor TOTP |
| Operations | Cloud Run migration/bootstrap/worker jobs, five-minute Scheduler trigger |
| Builds/secrets | Cloud Build, Artifact Registry, Secret Manager, private versioned Terraform state |

The initial integration environment defaults to one zonal Cloud SQL instance (`db-custom-1-3840`, 20 GB). This incurs ongoing charges on Blaze. `TF_VAR_availability_type=REGIONAL` enables HA with different costs. Neither configuration is a quoted budget or a tested recovery objective.

## Conditional deployment procedure

Only use after the user chooses Blaze and an authorized operator updates `billingPlan` to `blaze`. This is not authorized by the current Spark instruction.

Install Node 24, Python 3, Terraform and the Google Cloud/Firebase CLIs on the deployment machine. Authenticate interactively using the account that manages `incys-institute`; never paste service-account keys or refresh tokens into chat:

```bash
gcloud auth login
gcloud auth application-default login
firebase login
npm run cloud:preflight
```

`GCLOUD_BIN`, `TERRAFORM_BIN` and `FIREBASE_BIN` can select existing executable paths. The preflight checks account access, project number `688961840489`, linked billing and ADC. It does not enable billing or provision resources. The deployment identity needs service enablement, infrastructure/IAM management, builds and Firebase Hosting deployment permissions; these permissions must come from the project owner.

After reviewing the source and configuration, `npm run cloud:deploy` performs the conditional deployment. It creates regional database secrets without printing their values, provisions the foundation, builds a versioned image, preserves existing authorized domains and unrelated identity settings, applies the full stack, then runs migration and worker jobs. It refuses plans containing deletions/replacements. Hosting is published only after backend database readiness passes. Public live checks run before the scheduler is resumed.

No demo accounts or synthetic catalogue records are seeded into the deployed database. The migration job grants application data access to `incys_app`; only `incys_migrator` receives the migration secret and DDL privileges. Terraform state contains credentials and must remain private. `.deploy/` and all state/plan files are ignored by Git and excluded from build uploads.

## First real-user test after deployment

Register and verify the intended administrator through the app, then have the authorized operator run:

```bash
gcloud run jobs execute incys-bootstrap-admin \
  --project=incys-institute --region=asia-south1 \
  --update-env-vars=BOOTSTRAP_FIREBASE_UID=VERIFIED_FIREBASE_UID --wait
npm run test:live
```

The bootstrap refuses to run once an active administrator exists. Enroll TOTP at sign-in before using staff workspaces. Optionally supply a short-lived `INCYS_TEST_ID_TOKEN` through the local process environment for a read-only authenticated smoke test; never commit it.

Real provider acceptance remains necessary: registration/verification/MFA, account isolation, booking races, admissions and assessments, Razorpay test-mode orders/refunds/webhooks, private uploads/scanning, notification delivery and backup restoration. Payment secrets belong in Secret Manager via `runtime_secrets`; missing credentials keep online payments unavailable. The scanner is not provisioned by this stack. Register a separate Android Firebase app before configuring the native client; the supplied app ID is a web registration.

See [deployment operations](deployment.md), [delivery status](delivery-status.md) and [validation](validation.md). These local checks do not establish that Firebase, GCP or payment-provider integrations work in the client account.
