plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// La interfaz es la misma app de la TV LG (carpeta PipoTV): se compila con `npm run build`
// y se empaqueta dentro del APK.
val webDist = rootProject.file("../PipoTV/dist")
val webOut = layout.buildDirectory.dir("generated/web")

val copyWeb by tasks.registering(Sync::class) {
    doFirst {
        if (!webDist.resolve("index.html").exists() || !webDist.resolve("app.js").exists()) {
            throw GradleException("Falta la app de la TV: en la carpeta PipoTV ejecuta «npm ci && npm run build».")
        }
    }
    from(webDist) { exclude("appinfo.json") }
    into(webOut.map { it.dir("www") })
}

android {
    namespace = "com.personal.pipotv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.personal.pipotv"
        minSdk = 21
        targetSdk = 34
        versionCode = 2
        versionName = "1.1.0"
    }

    // Misma firma estable que Pipo para Android: se puede actualizar sin desinstalar.
    signingConfigs {
        create("personal") {
            storeFile = rootProject.file("../MusicPlayer/keystore/reproductor.jks")
            storePassword = "reproductor"
            keyAlias = "reproductor"
            keyPassword = "reproductor"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("personal")
        }
        debug {
            signingConfig = signingConfigs.getByName("personal")
        }
    }

    sourceSets["main"].assets.srcDir(webOut)

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

tasks.named("preBuild") { dependsOn(copyWeb) }

dependencies {
    // Sin dependencias: la app es una ventana a pantalla completa con la interfaz de la TV.
}
