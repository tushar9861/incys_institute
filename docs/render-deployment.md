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
| Verified live deploy | `dep-dc2gujpl8j1s73cmah6g` |
| Deployed source | `6f2609bcdc4da289197a5619b25871039fd6e78e` |
| Source repository | https://github.com/tushar9861/incys_institute/tree/main |
| Supabase | `hfncwozklfposeokqoio`, Free, Singapore |

The Docker service starts with `node server.js`, binds to Render's assigned port and uses `/api/v1/health` for database readiness. The runtime database login is `incys_app`, with `sslmode=verify-full` and the provider's bundled public root CA. Server credentials are stored in Render's environment settings and ignored local environment files; none are in Git, browser assets or the APK.

Automatic deploys and Blueprint synchronization are disabled during initial testing. Push changes to `main` before deploying. Use a Blueprint plan for infrastructure changes and inspect its diff before applying; for code-only releases, trigger a service deploy. Monitor the specific deploy until it is `live`, then run `NODE_USE_ENV_PROXY=1 INCYS_BASE_URL=https://incys-staging.onrender.com node scripts/live-check.mjs` from this managed workspace. The proxy prefix is environment-specific.

## Verified behavior

- HTTPS homepage and login page; catalogue loaded from the hosted database.
- Demo authentication and simulated payments disabled; unauthenticated workspace access and cross-origin mutations rejected.
- Supabase password sign-in and live token/session validation; a temporary identity received only the patient role and successfully read its workspace.
- Authenticated synthetic PDF upload created a private Storage object and database record. Quarantine prevented download. Global logout made the previous token return HTTP 401.
- Recovery-link generation accepted the live login redirect. This did not send or test an email.
- Desktop and phone browser checks passed without application errors or horizontal overflow.
- The job endpoint rejected unauthenticated requests and accepted a server-token invocation. This verifies manual execution, not automatic scheduling.
- Web and Android GitHub CI passed for the deployed commit. A separate Android debug APK built with `mobile/config/staging.json` contains the live endpoint and public Supabase settings; server-key absence was checked.

The test Auth identity and Storage object were removed. Application metadata was retired while preserving audit history. No real patient records or payment transactions were used.

## Remaining launch work

The institute administrator and approved course/service/product catalogue are not configured. Verify actual email delivery and recovery, staff MFA, business flows, payment-provider integration, scheduled jobs, document scanning and physical Android devices before launch. Free Render instances sleep after inactivity and may need about a minute to wake. Uploaded documents remain quarantined until the operator scanner runs. See [free staging](free-staging.md) and [delivery status](delivery-status.md).
