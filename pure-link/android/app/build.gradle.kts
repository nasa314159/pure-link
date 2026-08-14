plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "uk.no_no.purelink.tools"
  compileSdk = 35

  defaultConfig {
    applicationId = "uk.no_no.purelink.tools"
    minSdk = 23
    targetSdk = 35
    versionCode = 1
    versionName = "0.1.0"
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

kotlin {
  jvmToolchain(17)
}

dependencies {
  implementation(project(":core"))
  testImplementation("junit:junit:4.13.2")
}
