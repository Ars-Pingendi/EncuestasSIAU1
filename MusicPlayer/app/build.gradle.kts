plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.personal.reproductor"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.personal.reproductor"
        minSdk = 26
        targetSdk = 34
        versionCode = 5
        versionName = "1.2.0"
    }

    // Firma estable (keystore del repositorio) para poder actualizar el APK sin desinstalar.
    signingConfigs {
        create("personal") {
            storeFile = rootProject.file("keystore/reproductor.jks")
            storePassword = "reproductor"
            keyAlias = "reproductor"
            keyPassword = "reproductor"
        }
    }

    buildTypes {
        release {
            // Sin R8: app de uso personal, se prioriza que el APK sea lo más robusto posible.
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = signingConfigs.getByName("personal")
        }
        debug {
            signingConfig = signingConfigs.getByName("personal")
        }
    }

    compileOptions {
        // NewPipeExtractor usa APIs de Java modernas; el desugaring las hace funcionar en Android 8+.
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }

    packaging {
        resources {
            excludes += setOf(
                "/META-INF/{AL2.0,LGPL2.1}",
                "META-INF/DEPENDENCIES",
                "META-INF/LICENSE*",
                "META-INF/NOTICE*",
                "META-INF/*.md",
                "META-INF/versions/9/module-info.class",
                "META-INF/versions/*/OSGI-INF/MANIFEST.MF",
            )
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.4")
    implementation("androidx.activity:activity-compose:1.9.2")

    // Jetpack Compose + Material 3
    implementation(platform("androidx.compose:compose-bom:2024.09.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    // Reproducción (ExoPlayer + MediaSession + notificación multimedia)
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-session:1.4.1")

    // YouTube sin anuncios (misma librería que la app NewPipe). Licencia GPL-3.0.
    implementation("com.github.TeamNewPipe:NewPipeExtractor:v0.27.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs_nio:2.1.5")

    // Listas de reproducción, favoritos y estadísticas
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")
}
