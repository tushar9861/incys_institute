# INCYS institute platform

An implemented development release for the Institute of Nature Cure & Yogic Science, Balasore. It includes an installable mobile-first web app, role-based workspaces, a shared PostgreSQL API, a matching Android app shell, the earlier Flutter prototype, and GCP infrastructure definitions. Advertising and marketing automation are excluded.

**Testing site:** [incys-staging.onrender.com](https://incys-staging.onrender.com) is live on **Render Free + Supabase Free**. Live checks passed for database access, password sign-in, session revocation, private uploads and quarantine enforcement; demo authentication and simulated payments are disabled. See [deployment details](docs/render-deployment.md) and [free staging](docs/free-staging.md). The first institute administrator, approved catalogue content, email delivery, staff MFA, payments and remaining [launch acceptance](docs/delivery-status.md) still need completion. GCP remains paused because its billing account is closed. No real payments have been collected.

## Run locally

Use Node.js 24, npm, Docker Compose and PostgreSQL 17.

```bash
npm ci
cp .env.example .env.local
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. Set `APP_ORIGIN` to the exact origin you use if you change the host or port. The database remains in the Compose volume across restarts. `docker compose down` stops it without deleting data.

The local password is `local-demo-only-change-me`. Accounts are:

| Email                        | Workspace                                                     |
| ---------------------------- | ------------------------------------------------------------- |
| `patient@demo.incys.local`   | Bookings, care plans, reports, shopping, payments and support |
| `student@demo.incys.local`   | Courses, classes, assignments, timed quizzes and certificates |
| `trainer@demo.incys.local`   | Cohorts, lessons, classes, attendance and grading             |
| `clinician@demo.incys.local` | Assigned appointments, encounter notes and treatment plans    |
| `vendor@demo.incys.local`    | Product submissions, stock, fulfilment and commission ledger  |
| `reception@demo.incys.local` | Appointment operations and enquiries                          |
| `finance@demo.incys.local`   | Payments, refunds and fee visibility                          |
| `admin@demo.incys.local`     | Admissions, approvals, access, content, finance and audit     |

The seed script refuses to run in production. Local passwords, synthetic payment capture and filesystem uploads are disabled when `NODE_ENV=production`. `npm run build && npm start` therefore requires configured Firebase or Supabase authentication for sign-in; use `npm run dev` for the synthetic demonstration.

Run `npm run worker` to deliver pending in-app notifications and expire eligible unpaid stock reservations. Free staging uses an operator-run job until a trusted scheduler is configured. The optional GCP architecture uses a scheduled Cloud Run job and paid Cloud SQL.

## What works in this release

- Booking against practitioner availability with database-enforced overlap prevention; patient/practitioner clinical record access; immutable notes; care plans and session counts; gated online consultation links.
- Course applications, admissions approval, versioned curricula, cohorts, lessons, live class links, attendance, assignment submissions with protected attachments/grading, timed server-graded quizzes, completion eligibility, printable certificates and QR verification.
- Vendor onboarding and product approval, stock reservation, checkout, fulfilment, 5% default commission snapshots and a balanced ledger. Full refund requests require an approver other than the requester. Late captures are preserved for reconciliation.
- Operational enquiries, support responses, audience-specific announcements, privacy request review, private document uploads/downloads and an audit log.
- Firebase or Supabase authentication integration, staff/vendor TOTP enrollment and sign-in, verified email, password reset, server-side role checks, bounded request bodies and webhook signature verification.

The production adapters are implemented but need testing against client-owned Firebase, Razorpay, GCS and scanning services. Meeting URLs open an external provider; automated room provisioning and short-lived participant tokens are not yet implemented.

## Firebase and GCP deployment

The registered `incys-institute` Firebase web app is configured in `config/firebase.web.json`; Analytics is not initialized. Firebase Hosting forwards the website and API to Cloud Run in Mumbai. Cloud SQL PostgreSQL stores application data, with Firebase Authentication for identity and a private GCS bucket for documents.

The project is on **Blaze**, as authorized by the user. Follow [the deployment guide](docs/firebase-deployment.md). `npm run cloud:preflight` verifies account access and the linked billing-account status; `npm run cloud:deploy` provisions the services, migrates the database and publishes Hosting after readiness checks. The Firebase web API key identifies the app; deployment uses the authorized Google Cloud account.

## Shared mobile interface

Home, Care, Learn, Shop and Account use the same interface on the web, installed iPhone/Android PWA, and the [shared Android app](mobile/shared-android/README.md). This is the current app for matching web/mobile testing; the Flutter client below is retained as the earlier prototype. See [mobile experience and Google authentication](docs/mobile-experience.md) for design, installation, security and acceptance details.

```bash
cd mobile/shared-android
./gradlew assembleDebug
```

Use JDK 21 and Android SDK 36. The testing APK is not a signed store release. Google sign-in uses Firebase's popup and the existing Supabase account/session; SMS is deferred.

## Earlier Flutter client

Use Flutter **3.50.1** with a full Java 21 JDK and Android SDK platforms 34, 35 and 36. Flutter installs its matching NDK when required.

```bash
cd mobile
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

`10.0.2.2` reaches the host from an Android emulator. For a physical development device, use a reachable host on the same network and keep the development database private. The native client is for patients and students; staff and vendors use the responsive web workspaces.

Build the earlier Flutter testing app with `flutter build apk --debug --dart-define-from-file=config/staging.json` from `mobile/`. This uses the live Render API and public Supabase settings; the build succeeded and its embedded endpoint was verified. Physical-device acceptance is pending. The older `mobile/config/live.json` still targets the undeployed Firebase endpoint. Configure a client-owned upload key using `mobile/android/key.properties.example`; the real key and properties file are ignored by Git. Release builds do not silently use the debug signing key.

## Validate

```bash
npm run typecheck
npm test
npm run test:scanner
npx playwright install chromium
npm run test:browser
npm run build
npm run test:smoke
npm run format:check
npm audit --omit=dev
cd infra/gcp
terraform init -backend=false
terraform validate
```

The backend test runner uses a separate database ending in `_test`, never truncates the application database, and exercises real PostgreSQL transactions. The HTTP smoke test starts and stops an isolated production server to verify routing, headers, database access and production demo-auth lockout. Flutter tests exercise session persistence, authenticated multipart uploads/downloads and permission errors. Browser tests require the local seeded demo environment and cover role navigation, a phone viewport and student-to-trainer attachment retrieval. Full accessibility and physical-device acceptance remain separate checks.

## Repository map

| Path                  | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `app/`, `components/` | Public website and web workspaces                                    |
| `server/`             | Authentication, authorization and domain operations                  |
| `database/`           | Ordered transactional SQL migrations                                 |
| `scripts/`            | Migration, synthetic seed, worker, bootstrap and validation commands |
| `mobile/`             | Flutter patient/student app                                          |
| `infra/gcp/`          | Cloud Run, Cloud SQL, storage, secrets IAM and scheduled jobs        |
| `tests/`              | Backend integration tests                                            |

Read [architecture](docs/architecture.md), [deployment](docs/deployment.md), [API guide](docs/api.md), [delivery status](docs/delivery-status.md), and [validation results](docs/validation.md) before preparing a client acceptance build.
