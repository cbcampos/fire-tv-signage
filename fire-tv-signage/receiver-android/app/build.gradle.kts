plugins {
    id("com.android.application")
}

val signageServerUrl = providers.gradleProperty("signageServerUrl").orElse("http://10.0.2.2:8080")

android {
    namespace = "com.signage.receiver"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.signage.receiver"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "SIGNAGE_SERVER_URL", "\"${signageServerUrl.get()}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")
}
