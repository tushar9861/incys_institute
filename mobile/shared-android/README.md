# Shared INCYS Android app

This is the Android testing client for the current INCYS interface. It opens the same HTTPS application as the browser and installed iPhone PWA using a Trusted Web Activity (Android Browser Helper). Navigation, permissions, records, email and Firebase Google sign-in all use the shared web application. No embedded WebView, duplicate database, or second authentication implementation is used.

Build with JDK 21 and Android SDK 36:

```sh
ANDROID_HOME=/path/to/android-sdk ./gradlew assembleDebug
```

The debug APK uses application ID `institute.incys.incys_mobile`, version code 2. It can update the existing testing APK when signed with the same local debug keystore. A browser that supports Trusted Web Activities (current Chrome recommended) is required. With another browser or before Digital Asset Links verification succeeds, a browser toolbar can appear.

The staging site's `public/.well-known/assetlinks.json` contains only the public certificate fingerprint of this workspace's debug signing key. A different developer key needs its own fingerprint. Production requires institute-owned release signing / Play App Signing, a release fingerprint in assetlinks.json, and a release build. Never commit private signing keys. Do not publish the debug APK to stores.

The earlier Flutter prototype remains in `mobile/`; it does not inherit this redesign. Use the shared Android build or install the web app for matching interfaces. Physical-device acceptance is still required for TWA domain verification, Google popup return, file downloads/uploads, and Android Back navigation.
