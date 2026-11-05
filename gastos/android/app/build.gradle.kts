import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.FileSystemOperations
import javax.inject.Inject

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// O número da execução do GitHub Actions vira a versão, para o Android aceitar atualizações.
val numeroBuild = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "br.com.meugasto"
    compileSdk = 35

    defaultConfig {
        applicationId = "br.com.meugasto"
        minSdk = 26
        targetSdk = 35
        versionCode = numeroBuild
        versionName = "0.2.$numeroBuild"
    }

    // Assinatura: com os segredos KEYSTORE_* configurados no GitHub, todas as versões saem com a
    // mesma chave e podem ser instaladas por cima. Sem eles, usa a chave de depuração da máquina
    // de build (muda a cada execução: para atualizar é preciso desinstalar antes).
    val arquivoChave = System.getenv("KEYSTORE_FILE")?.let { file(it) }?.takeIf { it.exists() }
    signingConfigs {
        if (arquivoChave != null) {
            create("fixa") {
                storeFile = arquivoChave
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KEY_ALIAS") ?: "meugasto"
                keyPassword = System.getenv("KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("fixa") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}

/** Copia o dashboard (public/) e o núcleo (nucleo/) para dentro do APK, em assets/web. */
abstract class CopiarWeb : DefaultTask() {
    @get:InputDirectory abstract val publico: DirectoryProperty
    @get:InputDirectory abstract val nucleo: DirectoryProperty
    @get:OutputDirectory abstract val saida: DirectoryProperty
    @get:Inject abstract val fs: FileSystemOperations

    @TaskAction
    fun copiar() {
        fs.sync {
            from(publico) { into("web") }
            from(nucleo) { into("web/nucleo") }
            into(saida)
        }
    }
}

androidComponents {
    onVariants { variante ->
        val nome = variante.name.replaceFirstChar { it.uppercase() }
        val tarefa = tasks.register<CopiarWeb>("copiarWeb$nome") {
            publico.set(rootProject.layout.projectDirectory.dir("../public"))
            nucleo.set(rootProject.layout.projectDirectory.dir("../nucleo"))
        }
        variante.sources.assets?.addGeneratedSourceDirectory(tarefa, CopiarWeb::saida)
    }
}
