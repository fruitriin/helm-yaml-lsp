plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.1.0"
    id("org.jetbrains.intellij.platform") version "2.2.1"
}

group = "com.anthropic"
version = "0.1.0"

repositories {
    mavenCentral()

    intellijPlatform {
        defaultRepositories()
    }
}

// LSP4IJライブラリを使用
dependencies {
    intellijPlatform {
        intellijIdeaCommunity("2024.2")

        // LSP4IJ plugin dependency
        plugin("com.redhat.devtools.lsp4ij:0.6.0")
    }
}

kotlin {
    jvmToolchain(21)  // IntelliJ Platform 2024.2 requires Java 21
}

intellijPlatform {
    pluginConfiguration {
        version.set("0.1.0")
        ideaVersion {
            sinceBuild.set("242")
            untilBuild.set("243.*")
        }
    }

    signing {
        certificateChain.set(System.getenv("CERTIFICATE_CHAIN"))
        privateKey.set(System.getenv("PRIVATE_KEY"))
        password.set(System.getenv("PRIVATE_KEY_PASSWORD"))
    }

    publishing {
        token.set(System.getenv("PUBLISH_TOKEN"))
    }
}

tasks {
    buildPlugin {
        doFirst {
            // LSPサーバーをプラグインにバンドル
            copy {
                from("../server/dist/")
                into(layout.buildDirectory.dir("resources/main/lsp-server/"))
                include("server.js", "server.js.map")
            }
        }
    }
}
