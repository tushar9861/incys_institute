# Configured Supabase project

Configured on 24 November 2026 using the owner's selected project and connected Supabase account.

| Setting | Verified value |
| --- | --- |
| Project reference | `hfncwozklfposeokqoio` |
| Project name | `incys-web-app` |
| Organization / plan | `incys institute` / Free |
| Region | Singapore (`ap-southeast-1`) |
| Project API | `https://hfncwozklfposeokqoio.supabase.co` |
| Session pooler | `aws-1-ap-southeast-1.pooler.supabase.com:5432` |
| Database | `postgres` |
| Runtime login | `incys_app.hfncwozklfposeokqoio` |
| Application schema | `incys` (private) |
| Private bucket | `incys-private` |

## Applied configuration

- All six application migrations were applied, creating **43 tables** including the migration record. Every table has row-level security enabled. The application schema is unavailable to `anon`, `authenticated` and `service_role`.
- The restricted `incys_app` role has data access through the application API, without superuser, role/database creation or RLS bypass privileges. Migration metadata is inaccessible; clinical notes, audit events and ledger history cannot be overwritten by runtime.
- The runtime password was generated inside PostgreSQL, retrieved into an ignored local environment file, and never placed in a SQL migration, source file or printed output. The one-time initialization function was removed afterwards. The database administrator password was not used or reset.
- The private document bucket accepts only PDF, PNG and JPEG files up to 10 MiB. There are no public document policies. Quarantined files remain unavailable until scanning succeeds.
- The server secret was verified against this project: the application's storage adapter uploaded and downloaded a synthetic PDF with identical bytes, while publishable-key access and the public URL were denied. The test object was deleted and its absence verified. Administrator identity lookup also succeeded without creating or modifying users.
- Email/password sign-in is enabled and automatic email confirmation is disabled. The project publishes an ES256 signing key supported by the backend.
- The configured server SDK reached the live Auth service and received `403/bad_jwt` for an intentionally invalid token. A real Data API request using `Accept-Profile: incys` returned `406/PGRST106`, confirming the private schema is not exposed. These are read-only checks, not completed-user sign-in acceptance.
- Supabase security advisors returned **no findings** after provisioning. Hosted catalog checks confirmed table and session-function access is denied to browser roles, and the runtime role cannot read migration metadata or overwrite audit history. An earlier management-role impersonation probe was denied; its proposed membership grant was rejected and was not applied. The live Render integration subsequently verified runtime writes and reads through the application's own restricted login, without role impersonation.
- The live Render API passed password sign-in, active-session validation, patient-only account provisioning, database-backed workspace reads, private document upload and quarantine blocking. Global logout invalidated the token immediately. The generated recovery link targeted the saved live login URL. No email was sent by this synthetic test.

The bootstrap SQL is generated from the application's migrations with `node --import tsx scripts/supabase-bootstrap.ts .deploy/incys-supabase-bootstrap.sql`. Applying it through Supabase records the provider migration and the six application migration names. The generator was tested locally for replay safety, RLS and restricted runtime access before application. Future schema changes must use the normal migration workflow and refresh permissions; do not recreate the project or seed demo users into it.

## Application settings

`config/supabase.web.json` contains only the verified public URL, project reference and publishable key. Both the server Supabase client and browser client use these defaults when their corresponding environment overrides are absent. Server JWT verification uses the same selected project URL. `render.yaml` pins the same public configuration.

`.env.supabase.local` is ignored by Git, has permissions `0600`, and contains the generated restricted database URL with `sslmode=verify-full`, Supabase mode, private storage configuration and `DEMO_MODE=false`. The existing local demo environment remains separate. Run `npm run dev:supabase` to select the hosted-backend configuration. On the managed workspace, prefix Node commands with `NODE_USE_ENV_PROXY=1` for HTTPS through the configured proxy; keep certificate verification enabled.

The owner-supplied `SUPABASE_SECRET_KEY` is configured in the protected local environment and Render's server environment. It enables backend private-file operations and administrator identity lookup. Never put it in `NEXT_PUBLIC_*`, an Android definition or source control.

The session pooler requires Supabase's root CA in addition to `sslmode=verify-full`. The public certificate is bundled at `config/supabase-ca-2021.crt`; set `sslrootcert=config/supabase-ca-2021.crt` in the runtime database URL when running from the repository or container working directory. It was downloaded over HTTPS from [Supabase's published certificate endpoint](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt), the same endpoint used by its dashboard. SHA-256 fingerprint: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`; expires 26 April 2031. Keep certificate-chain and hostname verification enabled.

## Hosted connection and remaining acceptance

The [Render website/API](https://incys-staging.onrender.com) is deployed. Its server environment contains the restricted database URL, server key and job token; `APP_ORIGIN` matches the HTTPS service URL. The owner saved Supabase's Site URL and login redirect allowlist. A generated recovery link confirmed the allowed login redirect.

The live Render service successfully connected through the session pooler using the restricted runtime credentials, verified TLS and bundled root CA. Database health, catalogue reads, user provisioning and document records passed. Direct PostgreSQL access from this managed workspace remains unavailable; that local network limitation no longer blocks the deployed backend.

The temporary synthetic Auth identity and Storage object were deleted after testing. Its application user is inactive and document is marked deleted, retaining audit history. The test used an explicitly confirmed synthetic identity; it does not establish real email delivery or staff TOTP acceptance. SMTP/default-sender limits, the designated institute administrator, approved catalogue, job scheduling, scanner operation and payment test credentials remain in the [free staging guide](free-staging.md).
