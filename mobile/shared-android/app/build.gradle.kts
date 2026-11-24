plugins { id("com.android.application") }
android {
    namespace = "institute.incys.incys_mobile"
    compileSdk = 36
    defaultConfig {
        applicationId = "institute.incys.incys_mobile"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "0.2.0"
    }
    buildTypes { release { isMinifyEnabled = false } }
}
dependencies { implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4") }
