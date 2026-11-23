# Validation record — 23 November 2026

Observed development checks, not a production acceptance certificate.

| Check | Result |
| --- | --- |
| PostgreSQL integration suite | **25 passed**: transactions, authorization, accounting, assessments, worker idempotency, restricted database privileges, assignment access, deferred quarantine, Supabase JWT validation/session revocation and private-schema RLS |
| TypeScript and optimized Next production build | Passed |
| Production HTTP smoke | Passed: pages, headers, database, catalogue and demo authentication lockout |
| Browser checks | **10 passed in one run**: all eight roles, phone navigation/layout, student upload/submission and assigned-trainer download with exact file-byte verification |
| Visual inspection | Desktop patient and phone student overview screenshots inspected; not a full accessibility audit |
| Scanner protocol/service tests | **5 passed**: exact clean verdict, malware rejection, engine failure, signature freshness and bounded bodies |
| Real ClamAV container | Built and ran locally; accepted a clean synthetic PDF and rejected the benign EICAR antivirus test file with HTTP 422 |
| Deferred scanner pipeline | Passed with real ClamAV through a local test relay: clean approval, EICAR rejection and operator audit. Used a disposable test database; hosted Storage remains untested |
| Flutter static analysis | Passed with no issues |
| Flutter API/session/document tests | **3 passed**: session persistence, authentication, multipart content, file download, permission errors and oversized upload rejection |
| Android APK | Debug build targets registered Android Firebase app and intended HTTPS API using `mobile/config/live.json`; backend must be deployed before it connects |
| Terraform validate | Passed; no client-account plan/apply, failover or restore test completed |
| Cloud authentication | Authorized Google Cloud account and ADC verified; Firebase CLI project access verified |
| Cloud operations | Required APIs enabled; Android Firebase app registered; no compute/database/storage/Hosting release provisioned |
| Deployment attempt | **Blocked**: Storage HTTP 403 “disabled in state delinquent”; linked “Firebase Payment” account reports `open: false`, despite project-level `billingEnabled: true` |
| Free staging build | Next production build passed with Supabase mode and placeholder public build configuration; not a hosted authentication test |
| Render configuration | Validated against Render's current public JSON Schema: one free web service, no paid database/disk/worker. CLI/platform account validation not performed |
| Free staging deployment | Not deployed: selected provider-account access and GitHub write access pending; existing connected destinations were declined |
| Physical Android-device, provider payments, cloud IAM/scanner and full accessibility acceptance | Not performed |

The backend tests use a separate PostgreSQL database ending in `_test`. Browser checks use synthetic local demo accounts and files; local browser uploads do not invoke the production scanner. The scanner was tested independently against the real ClamAV container. Supabase schema tests emulate the provider's session table locally and verify RLS still blocks the anonymous role after an accidental SELECT grant. These results do not establish live Supabase/Firebase MFA, password recovery, payment/webhook/refund processing, hosted private storage or FCM delivery.

Earlier platform-container runtime, migration and worker checks passed. The latest application changes passed the Next build and HTTP smoke; the production image will be rebuilt by the deployment pipeline. The production npm dependency audit reported zero known vulnerabilities during this development session; an audit is not a security assessment.

The environment's approved proxy and CA trust stores were used for Firebase CLI, Docker and Android dependency access. Certificate verification remained enabled. Environment-specific proxy settings and deployment credentials are excluded from source and artifacts.

The user enabled Blaze and authorized deployment. After the user reported a billing fix, a retry still received the same Storage rejection; a read-only Billing API check confirmed the linked account remains closed. Deployment preflight now checks the account's `open` status before any provisioning. No synthetic accounts or catalogue were seeded in the client project. The designated institute administrator email is pending.

The APK is a debug integration artifact, not a signed Play release. The configured HTTPS endpoint is not yet live. See [delivery status](delivery-status.md) for implementation and launch acceptance still outstanding. Repository changes remain local because connected GitHub access reported read-only permissions.
