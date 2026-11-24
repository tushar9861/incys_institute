# Shared mobile experience

The current interface uses Home, Care, Learn, Shop and Account navigation in the browser, installed PWA and Android Trusted Web Activity. Patient and student workspaces keep the same five destinations; staff tools remain available through their authorized workspace menu. Routes preserve selected tabs through reload and browser Back. The same API, Supabase identity and private PostgreSQL records serve every device.

## Design and interaction

The system uses native system fonts, deep teal, sage surfaces and lilac/peach accents, a local vector wordmark and illustrations, safe-area padding, and a persistent bottom navigation. Public browsing works without signing in. Empty catalogues offer a real enquiry form; no fabricated services, stock, qualifications, prices or appointments are shown. Error states support retry, searches support clearing, and mutations retain server validation. The local Lottie breathing animation starts only on request, pauses off-screen or when the page is hidden, and respects reduced motion.

Small-screen tables become labeled record cards. Booking shows practitioners assigned to the selected service and times derived from their published availability, displayed in India time. The API still owns conflict detection and pricing. A conflicting slot is removed from the current picker and the user can choose another. Admissions require an explicit consent confirmation. Dialogs manage keyboard focus, Escape and focus restoration.

## Google and email identity

Email/password, recovery, verification and TOTP continue to use the existing Supabase project. Google uses Firebase's Google popup, with a fresh SHA-256 nonce. The returned **Google ID token** is exchanged with Supabase `signInWithIdToken`; the Firebase ID token is never accepted by the application API. The transient Firebase session uses memory persistence and is signed out after the exchange. Supabase JWT validation, account ownership, session revocation and staff MFA remain enforced.

The Firebase Google provider is enabled and `incys-staging.onrender.com` is an authorized domain. Supabase's Google provider must allow the same web OAuth client ID:

```text
688961840489-57d6gonl0o2ta6o7i5i764ejd5doeb8a.apps.googleusercontent.com
```

Keep nonce checks enabled. Copy the OAuth secret directly from Firebase Authentication → Google → Web SDK configuration into Supabase if configuring Supabase's redirect OAuth flow as well. Never commit or expose the secret to the browser. The application uses the Firebase popup and ID-token exchange rather than Supabase's redirect OAuth flow. `/api/v1/config` reports Google availability from Supabase's public provider settings with a 60-second cache; the button is hidden when unavailable. `GOOGLE_SIGN_IN_ENABLED=false` disables it explicitly. No SMS provider or billable OTP flow is enabled.

The user confirmed a successful personal Google sign-in on 24 November 2026. Automated hosted checks also verified the Firebase popup reaches Google, the email sign-in UI opens the patient workspace, and logout revokes access. Existing-email account linking, staff MFA after Google sign-in, and popup return on physical iPhone/Android devices still need their designated acceptance cases.

## Phone installation

- iPhone: open the live site in Safari → Share → Add to Home Screen.
- Android: install from the browser menu, or use the APK built from [`mobile/shared-android`](../mobile/shared-android/README.md).

The Android app uses a trusted browser, allowing the shared Google login flow. Its public certificate fingerprint is published in `/.well-known/assetlinks.json`. The debug APK is for testing, not store distribution. Release signing and Play submission remain separate tasks. The previous Flutter prototype is retained but does not carry this redesign.

Only `offline.html` is cached by the service worker. Authenticated pages, API responses, files and health records are never placed in Cache Storage. Offline mode explains that a connection is required and offers retry; it does not promise offline booking or record access.

## Verification

Browser coverage includes all eight roles, five destinations at 320/390/768/1440px, empty/error/search states, enquiry consent and focus restoration, booking conflicts, reload/Back, reduced motion, manifest assets and student-to-trainer private attachments. Backend tests continue to cover JWT signatures/issuers, ownership, revocation, immutable records, booking concurrency, payments and private files. Provider availability has an isolated test for disabled, enabled, cached and unreachable states. The Android build and certificate check validate packaging; no Android device is attached to this workspace, so physical-device acceptance remains outstanding.
