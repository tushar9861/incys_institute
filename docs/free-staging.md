# Free testing deployment

The current target is one **Render Free** Docker web service plus a dedicated **Supabase Free** project for PostgreSQL, authentication and private documents. Google Cloud provisioning is paused because its linked billing account is closed. Do not create paid services or upgrade either provider as part of this setup.

This is for small, synthetic-data tests. Render sleeps after inactivity and its first request can take about a minute. Database/storage/egress quotas and project pausing apply. Confirm available free capacity in the owner's chosen accounts before provisioning. A free Render database is deliberately not used because it expires.

## Prerequisites and current status

New hosting-account access is pending. No Supabase or Render resources have been created. The connected accounts were not the user's selected destination; the shared browser failed before opening new-account signup.

The supplied GitHub repository is `tushar9861/incys_institute`. It is empty and the connected GitHub account currently has read-only access. Push the reviewed development branch once write access is available. Render must be able to clone that branch; local source alone cannot be deployed by its Git builder.

## Supabase setup

1. Create a dedicated project in the confirmed Free organization after confirming its quoted cost is zero. Singapore aligns with the proposed Render service. Confirm the final region before storing actual institutional records.
2. Enable email/password, email confirmation and TOTP enrollment/verification. Set the actual website HTTPS origin as Site URL and allow its `/login` redirect. Use an asymmetric **ES256 or RS256** JWT signing key; this implementation rejects legacy HS256 tokens. Set a minimum password length of 12 and disable anonymous sign-ins.
3. Supabase's default mail sender only permits organization-team addresses and has a small rate limit. Configure a verified SMTP sender or Send Email hook before broader registration or recovery. Do not disable email verification to avoid the limit.
4. Obtain the **session-mode** PostgreSQL pooler connection from the Connect panel: port **5432**, not transaction-mode 6543. Use TLS with certificate verification and the provider's CA if required. Never disable certificate validation.
5. Run migrations as the owner with `DATABASE_SCHEMA=incys` and `AUTH_MODE=supabase`. Create a separate random-password runtime URL with username `incys_app.PROJECT_REF` on the same session pooler/database. Supply it as `RUNTIME_DATABASE_URL` to the role provisioner. Keep credentials in an ignored, permission-restricted environment file:

   ```bash
   node --env-file=.deploy/supabase-owner.env --import tsx scripts/migrate.ts
   node --env-file=.deploy/supabase-owner.env --import tsx scripts/provision-runtime-db.ts
   ```

   Runtime receives data access, not schema changes or permission to overwrite immutable history. Business tables use private schema `incys`, with RLS allowing only the trusted API role. Browser roles have no schema/table access. **Do not expose `incys` through the Data API.** The narrowly granted private session-check function verifies revocation without exposing `auth.sessions` to the API role. Repeat provisioning after later migrations to protect new tables.
6. Create private Storage bucket `incys-private`, maximum 10 MiB, allowing only PDF, PNG and JPEG MIME types. Do not add browser upload/read policies. Only the server uses the secret key and returns files after authorization and scanning checks.
7. Run security advisors and verify browser credentials cannot query business data, list bucket objects or fetch quarantined files.

## Render configuration

`render.yaml` explicitly requests one `plan: free` Docker web service, with no disk, database, worker or paid cron resource. Automatic deployment is off during initial testing. The container binds to `0.0.0.0:$PORT`.

Set `NEXT_PUBLIC_AUTH_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` **before building**. These are public configuration; only public values are declared as Docker build arguments.

Set runtime values through Render's environment configuration:

| Variable | Value |
| --- | --- |
| `NODE_ENV`, `AUTH_MODE`, `DEMO_MODE` | `production`, `supabase`, `false` |
| `DATABASE_SCHEMA` | `incys` |
| `DATABASE_URL` | Restricted runtime session-pooler URL, never the owner URL |
| `APP_ORIGIN` | Exact Render HTTPS origin, no trailing slash |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Same project as the browser configuration |
| `SUPABASE_SECRET_KEY` | Server-only project secret key |
| `STORAGE_PROVIDER`, `SUPABASE_STORAGE_BUCKET` | `supabase`, `incys-private` |
| `DOCUMENT_SCAN_MODE` | `deferred` |
| `WORKER_TOKEN` | Random secret of at least 32 characters |

Leave GCP credentials, `FIREBASE_PROJECT_ID` and real payment secrets unset. Do not import the local demo `.env.local`. After deployment, run `INCYS_BASE_URL=https://ACTUAL_SERVICE.onrender.com npm run test:live`. A successful build does not establish that deployment or identity integration works.

## Scanning and jobs

Free Render memory is insufficient for full ClamAV. Documents remain **quarantined** and unavailable for download or assignment attachment until scanned. Run the finite scanner on a trusted operator computer with current ClamAV signatures, restricted database credentials and private storage access:

```bash
node --env-file=.deploy/operator.env --import tsx scripts/scan-pending.ts
```

It processes up to 20 documents, accepts only an exact clean verdict, rejects detected files and leaves files quarantined on errors. Do not manually approve unchecked files. This operator step is a limitation of initial free staging, not an automatic hosted scanner.

Deliver pending in-app notifications and expire eligible reservations with:

```bash
node --env-file=.deploy/operator.env --import tsx scripts/worker.ts
```

A trusted scheduler can alternatively POST to `/api/v1/internal/worker` with `WORKER_TOKEN` as a bearer token. The endpoint exists; no hosted schedule has been provisioned. If using Supabase Cron/pg_net, keep the token in Vault and restrict access to the HTTP request queue, which temporarily contains decrypted headers. Schedule business work rather than idle keep-alive requests. Do not assume jobs run automatically until a schedule is configured and observed. Firebase push is not configured in this deployment; in-app notices remain supported.

## Administrator and Android

The owner must designate the administrator. After that identity's email is verified, set `BOOTSTRAP_SUPABASE_UID` to its exact ID and run `scripts/bootstrap-supabase-admin.ts` using the operator environment. This refuses to replace an existing administrator or link a different identity by email. Staff and vendors enroll an authenticator on the website. Every account with a verified factor must complete MFA before API access; the current Android client supports password sessions, so MFA-enabled accounts use the website.

After the actual endpoint exists, build Android with `API_BASE_URL`, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` Dart definitions. Never include a server secret. Mobile sessions use encrypted storage and refresh before expiry; requests allow 90 seconds for cold starts without automatically retrying mutations. The older `mobile/config/live.json` and integration APK still target the undeployed Firebase endpoint and are not Supabase builds.

Hosted acceptance must cover registration/recovery, MFA, revoked sessions, booking conflicts, admissions/assessments, document scan transitions, cross-account isolation, jobs and payment test webhooks. Start with designated test identities and synthetic records. Razorpay test credentials and the institute administrator identity remain pending. See [delivery status](delivery-status.md) for remaining implementation and launch requirements.
