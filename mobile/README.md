# INCYS Android client

Native patient/student application for the shared INCYS API. Includes appointment booking, encounter records, learning, timed quizzes, store checkout, payments, refund requests, support, privacy requests, protected document uploads/downloads, assignment attachments and notifications. Staff/vendor workflows use the responsive web application.

Use Flutter 3.50.1, a full JDK 21, Android SDK platforms 34/35/36, and the Flutter-managed NDK. See the [root README](../README.md) for the database, API, demo accounts and validation commands, and the [deployment runbook](../docs/deployment.md) for Firebase and release signing.

```bash
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

The default endpoint targets a local Android emulator's host. A release build must use HTTPS. Session tokens are stored with `flutter_secure_storage`; hosted builds authenticate using the selected Supabase or Firebase provider. No client secret or real payment credential belongs in Dart defines.

Physical-device testing and Play release publication are separate acceptance tasks. The Android project does not contain a client release signing key.

The current free testing configuration uses Render and Supabase. Build it with `flutter build apk --debug --dart-define-from-file=config/staging.json`. This includes only the public API URL and Supabase client settings. Staff and MFA-enabled accounts use the website; Android currently supports patient/student password sessions. Verify the hosted backend and test on a physical device before distribution.

The Android Firebase app is also registered. The older `config/live.json` targets the undeployed Firebase Hosting endpoint and is retained for a future GCP rollout. Debug builds are for testing, not Play publication.
