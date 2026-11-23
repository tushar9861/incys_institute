# Validation record — 23 November 2026

This records observed checks in the development environment, not a production acceptance certificate.

| Check                                                       | Result                                                                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL integration suite                                | **19 passed**, including concurrency, authorization, accounting, assessment timing, file access and worker idempotency |
| TypeScript                                                  | Passed                                                                                                                 |
| Optimized Next production build                             | Passed                                                                                                                 |
| Production HTTP smoke                                       | Passed: pages, headers, database, catalogue and local/demo authentication disabled                                     |
| Formatting                                                  | Passed                                                                                                                 |
| npm production dependency audit                             | **0 known vulnerabilities**                                                                                            |
| Docker image build                                          | Passed before final consent changes; final rebuild blocked by Docker registry HTTP 503                                 |
| Docker runtime smoke                                        | Passed: database health, homepage and demo lockout                                                                     |
| Docker migration and worker commands                        | Passed                                                                                                                 |
| Flutter static analysis                                     | Passed, no issues                                                                                                      |
| Flutter API/session tests                                   | **2 passed**                                                                                                           |
| Android debug APK                                           | Built successfully; configured for emulator API at `http://10.0.2.2:3000`                                              |
| Terraform validate                                          | Passed                                                                                                                 |
| Browser, responsive visual and accessibility review         | **Blocked** by unavailable browser runtime / preview relay                                                             |
| Physical Android-device and provider acceptance             | **Not performed**                                                                                                      |
| GCP plan/apply, recovery/load tests, signed Android release | **Not performed**                                                                                                      |

The container build used the environment's approved CA bundle through an optional BuildKit secret. Android dependency downloads used the environment proxy and existing system Java trust store. Certificate verification remained enabled. These environment-specific settings are not embedded in application source or release credentials.

Firebase MFA, Razorpay order/refund/webhooks, GCS, malware scanning and FCM have integration code but have not been tested against the client's configured services. Sample account and catalogue records are synthetic. The APK is a debug review artifact, not a Play Store release or a client-deployed app.

See [delivery status](delivery-status.md) for features still needing implementation or acceptance. Source and review artifacts have not been pushed to GitHub because the connected repository access reported read-only permissions.
