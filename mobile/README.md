# INCYS Android client

Native patient/student application for the shared INCYS API. Includes appointment booking, encounter records, learning, timed quizzes, store checkout, payments, refund requests, support, privacy requests, protected document uploads/downloads, assignment attachments and notifications. Staff/vendor workflows use the responsive web application.

Use Flutter 3.50.1, a full JDK 21, Android SDK platforms 34/35/36, and the Flutter-managed NDK. See the [root README](../README.md) for the database, API, demo accounts and validation commands, and the [deployment runbook](../docs/deployment.md) for Firebase and release signing.

```bash
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

The default endpoint targets a local Android emulator's host. A release build must use HTTPS. Session tokens are stored with `flutter_secure_storage`; production authenticates using Firebase ID tokens. No client secret or real payment credential belongs in Dart defines.

Physical-device testing and Play release publication are separate acceptance tasks. The Android project does not contain a client release signing key.

The Android Firebase app is registered. Build against the intended live API with `flutter build apk --debug --dart-define-from-file=config/live.json`. This uses public Firebase client settings and the HTTPS Hosting endpoint; cloud deployment must succeed before the app connects. The debug build is for testing, not Play publication.
