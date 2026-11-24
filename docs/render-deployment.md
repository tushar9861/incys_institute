# Live testing deployment

Verified on 24 November 2026. This is a testing environment, not a completed production acceptance.

| Setting | Value |
| --- | --- |
| Website | https://incys-staging.onrender.com |
| Sign-in | https://incys-staging.onrender.com/login |
| Database readiness | https://incys-staging.onrender.com/api/v1/health |
| Render workspace | `nattis-game-workspace` |
| Service | `srv-dc2gqcvlk1mc739upu1g`, Free, Singapore |
| Dashboard | https://dashboard.render.com/web/srv-dc2gqcvlk1mc739upu1g |
| Blueprint | `exs-dc2gsmm7bikc738l9asg` |
| Verified live deploy | `dep-dc2hs2u8bjmc73foo3og` |
| Deployed source | `b1ea3cce797c8af1ae62cdad0a7610b7f680a7d2` |
| Source repository | https://github.com/tushar9861/incys_institute/tree/main |
| Supabase | `hfncwozklfposeokqoio`, Free, Singapore |

The Docker service starts with `node server.js`, binds to Render's assigned port and uses `/api/v1/health` for database readiness. The runtime database login is `incys_app`, with `sslmode=verify-full` and the provider's bundled public root CA. Server credentials are stored in Render's environment settings and ignored local environment files; none are in Git, browser assets or the APK.

Automatic deploys and Blueprint synchronization are disabled during initial testing. Push changes to `main` before deploying. Use a Blueprint plan for infrastructure changes and inspect its diff before applying; for code-only releases, trigger a service deploy. Monitor the specific deploy until it is `live`, then run `NODE_USE_ENV_PROXY=1 INCYS_BASE_URL=https://incys-staging.onrender.com node scripts/live-check.mjs` from this managed workspace. The proxy prefix is environment-specific.

## Verified behavior

- Shared mobile-first Home, Care, Learn, Shop and Account screens; HTTPS catalogue and sign-in pages. Phone and desktop checks found no horizontal overflow or application script errors.
- Demo authentication and simulated payments disabled; unauthenticated workspace access and cross-origin mutations rejected.
- Supabase password sign-in and live token/session validation; a temporary identity received only the patient role and successfully read its workspace.
- Authenticated synthetic PDF upload created a private Storage object and database record. Quarantine prevented download. Global logout made the previous token return HTTP 401.
- Recovery-link generation accepted the live login redirect. This did not send or test an email.
- Desktop and phone browser checks passed without application errors or horizontal overflow.
- The job endpoint rejected unauthenticated requests and accepted a server-token invocation. This verifies manual execution, not automatic scheduling.
- Firebase Google popup reached Google on the hosted app; the user confirmed completing Google sign-in successfully. Existing email UI sign-in, patient-only workspace and logout revocation passed with a temporary synthetic identity.
- PWA manifest, local Lottie animation, icons, offline help and Android Digital Asset Links are served from the container. Google’s domain-association check returned `linked: true`.
- The current Android testing APK is built from `mobile/shared-android`, uses the exact shared website interface, and is approximately 4.7 MB. Its signature matches the published certificate fingerprint. Browser assets and APK were checked for server-secret absence. The earlier Flutter APK remains a separate prototype.

The test Auth identity and Storage object were removed. Application metadata was retired while preserving audit history. No real patient records or payment transactions were used.

## Current validation

The current Render source is `b1ea3cce797c8af1ae62cdad0a7610b7f680a7d2`. Its web and shared-Android CI jobs passed. The legacy Flutter job is tracked separately in [the validation run](https://github.com/tushar9861/incys_institute/actions/runs/45332311468). Hosted readiness, source version, Google button availability, separate sign-in/recovery touch targets and five-tab navigation were rechecked after the final CSS deployment.

## Remaining launch work

The institute administrator and approved course/service/product catalogue are not configured. Verify actual email delivery and recovery, staff MFA, business flows, payment-provider integration, scheduled jobs, document scanning and physical Android devices before launch. Free Render instances sleep after inactivity and may need about a minute to wake. Uploaded documents remain quarantined until the operator scanner runs. See [free staging](free-staging.md) and [delivery status](delivery-status.md).
