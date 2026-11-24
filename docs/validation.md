# Validation record — updated 24 November 2026

## Shared mobile redesign — 24 November 2026

- 20 browser scenarios passed: all eight roles, five public tabs at 320/390/768/1440px, enquiry consent and focus restoration, catalogue retry/filter states, browser Back/reload, booking conflict recovery, reduced motion, PWA assets, and student/trainer attachments.
- 25 PostgreSQL/auth integration checks passed, plus the new isolated Google provider availability test (26 checks total).
- TypeScript, formatting, production build with `NEXT_PUBLIC_AUTH_MODE=supabase`, and expanded production HTTP smoke checks passed.
- Android trusted app shell assembled successfully with SDK 36 / JDK 21. APK signature matches the public Digital Asset Links certificate fingerprint. No physical device was attached.
- Firebase Google provider enabled; live Render origin authorized. Google authorization initialization uses the expected web client and forwards the nonce. Supabase reports Google enabled and rejects an invalid Google ID token. These are configuration and negative checks, not a completed personal Google sign-in.
- Live deployment acceptance for the new source is recorded in [Render deployment](render-deployment.md) after the deployment completes.


Observed development checks, not a production acceptance certificate.

| Check | Result |
| --- | --- |
| PostgreSQL integration suite | **25 passed**: transactions, authorization, accounting, assessments, worker idempotency, restricted database privileges, assignment access, deferred quarantine, Supabase JWT validation/session revocation and private-schema RLS |
| TypeScript and optimized Next production build | Passed |
| Production HTTP smoke | Passed: pages, headers, database, catalogue and demo authentication lockout |
| Browser checks | **10 passed in one run**: all eight roles, phone navigation/layout, student upload/submission and assigned-trainer download with exact file-byte verification |
| Visual inspection | Local desktop patient/phone student overviews and live desktop/phone public homepage screenshots inspected; not a full accessibility audit |
| Scanner protocol/service tests | **5 passed**: exact clean verdict, malware rejection, engine failure, signature freshness and bounded bodies |
| Real ClamAV container | Built and ran locally; accepted a clean synthetic PDF and rejected the benign EICAR antivirus test file with HTTP 422 |
| Deferred scanner pipeline | Passed with real ClamAV through a local test relay: clean approval, EICAR rejection and operator audit. Used a disposable test database; a combined hosted upload/scanner workflow remains untested |
| Flutter static analysis | Passed with no issues |
| Flutter API/session/document tests | **3 passed**: session persistence, authentication, multipart content, file download, permission errors and oversized upload rejection |
| Android APK | Supabase debug build succeeded with `mobile/config/staging.json`; embedded live Render endpoint and absence of the server key verified. Physical-device acceptance pending; older Firebase artifacts remain separate |
| Terraform validate | Passed; no client-account plan/apply, failover or restore test completed |
| Cloud authentication | Authorized Google Cloud account and ADC verified; Firebase CLI project access verified |
| Cloud operations | Required APIs enabled; Android Firebase app registered; no compute/database/storage/Hosting release provisioned |
| Deployment attempt | **Blocked**: Storage HTTP 403 “disabled in state delinquent”; linked “Firebase Payment” account reports `open: false`, despite project-level `billingEnabled: true` |
| Free staging build | Next production build passed with Supabase mode and the verified public configuration for `hfncwozklfposeokqoio`; not a hosted sign-in test |
| Render configuration | Public JSON Schema and provider Blueprint planning passed; one Free web service in the confirmed workspace, no paid database/disk/worker, database health check enabled |
| Supabase provisioning | Six migrations, 43 RLS-protected tables, restricted runtime login and private 10 MiB document bucket configured on the selected Free project; security advisors report no findings |
| Hosted permissions/auth configuration | Public roles have no app-schema/session-function access; runtime lacks schema creation, migration metadata and immutable-update privileges. ES256 key, password sign-in and required email confirmation verified |
| Live HTTP checks | Configured backend SDK received `403/bad_jwt` for an invalid token; Data API rejected `incys` schema with `406/PGRST106`; public bucket metadata access denied |
| Live private Storage and server key | Passed using the application's adapter: private 10 MiB bucket confirmed, synthetic PDF upload and byte-identical download, publishable-key/public-URL download denied, test object deleted and absence verified. Administrator identity lookup succeeded; no users changed |
| Direct runtime connection | Passed from Render using restricted `incys_app` credentials, `sslmode=verify-full` and the published Supabase root CA. Health, catalogue, account provisioning and document writes succeeded. Workspace-local direct TCP remains unavailable |
| Free staging deployment | **Live** at https://incys-staging.onrender.com; deploy `dep-dc2gujpl8j1s73cmah6g`, source `6f2609b`. GitHub source published and write access verified |
| Live application identity and uploads | Passed: temporary Supabase password session, patient-only workspace, database writes, private PDF upload with HTTP 201, quarantine download denied, globally revoked token rejected with HTTP 401. Auth identity and Storage object removed; app user inactive and document marked deleted |
| Live auth redirect | Owner saved Site URL/allowlist; generated recovery link targeted the live `/login` URL. No email sent; real delivery remains unverified |
| Live public browser checks | Desktop and phone homepage/catalogue/login passed; no application errors, demo controls or horizontal overflow |
| Live job endpoint | Missing job credentials rejected with HTTP 401; authorized invocation returned HTTP 200. No automatic schedule is configured |
| GitHub CI | Both web and Android jobs passed for deployed commit `6f2609b` |
| Physical Android-device, provider payments, cloud IAM/scanner and full accessibility acceptance | Not performed |

The backend integration suite uses a separate PostgreSQL database ending in `_test`. Local browser checks use synthetic demo accounts; the scanner was tested independently against real ClamAV. Supabase schema tests emulate the provider's session table locally and verify RLS still blocks the anonymous role after an accidental SELECT grant. Subsequent live checks exercised the deployed authenticated API, hosted database and private Storage with one temporary, explicitly confirmed synthetic identity. They do not establish real verification/recovery email delivery, staff MFA, payment/webhook/refund processing, the complete hosted scanner workflow or FCM delivery.

Earlier platform-container runtime, migration and worker checks passed. Render built and deployed the production image; live HTTP smoke checks passed. The production npm dependency audit reported zero known vulnerabilities during this development session; an audit is not a security assessment.

The environment's approved proxy and CA trust stores were used for Firebase CLI, Docker and Android dependency access. Certificate verification remained enabled. Environment-specific proxy settings and deployment credentials are excluded from source and artifacts.

The user enabled Blaze and authorized deployment. After the user reported a billing fix, a retry still received the same Storage rejection; a read-only Billing API check confirmed the linked account remains closed. GCP deployment preflight checks the account's `open` status before provisioning. No accounts or catalogue were seeded in Google Cloud. The separate Supabase deployment test retained only retired synthetic application metadata and audit history. The designated institute administrator email and approved catalogue remain pending.

The current Supabase APK is a debug testing artifact, not a signed Play release. Its HTTPS endpoint is live. See [deployment details](render-deployment.md) and [delivery status](delivery-status.md) for launch acceptance still outstanding. Source is published to GitHub `main`; later Android configuration and documentation commits do not change the deployed web application.
