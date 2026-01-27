package com.anthropic.helm_yaml_lsp.lsp

import com.anthropic.helm_yaml_lsp.settings.HelmYamlLspSettings
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.redhat.devtools.lsp4ij.LanguageServerFactory
import com.redhat.devtools.lsp4ij.client.LanguageClientImpl
import com.redhat.devtools.lsp4ij.server.StreamConnectionProvider
import java.io.File
import java.io.InputStream
import java.io.OutputStream

/**
 * Helm YAML LSP Server Factory
 *
 * LSP4IJを使用してLSPサーバーを統合します。
 */
class HelmYamlLspServerFactory : LanguageServerFactory {

    override fun createConnectionProvider(project: Project): StreamConnectionProvider {
        return HelmYamlLspConnectionProvider(project)
    }

    override fun createLanguageClient(project: Project): LanguageClientImpl {
        return LanguageClientImpl(project)
    }
}

/**
 * Helm YAML LSP Connection Provider
 *
 * LSPサーバーの起動とストリーム接続を管理します。
 */
class HelmYamlLspConnectionProvider(
    private val project: Project
) : StreamConnectionProvider {

    private var process: Process? = null

    companion object {
        private val LOG = Logger.getInstance(HelmYamlLspConnectionProvider::class.java)
    }

    override fun start() {
        val settings = HelmYamlLspSettings.getInstance()
        val serverPath = findServerPath(settings)

        LOG.info("Helm YAML LSP: Starting server from: $serverPath")

        val command = listOf("node", serverPath)
        val processBuilder = ProcessBuilder(command)
        processBuilder.redirectError(ProcessBuilder.Redirect.INHERIT)

        process = processBuilder.start()
    }

    override fun getInputStream(): InputStream? {
        return process?.inputStream
    }

    override fun getOutputStream(): OutputStream? {
        return process?.outputStream
    }

    override fun stop() {
        process?.destroy()
        process = null
        LOG.info("Helm YAML LSP: Server stopped")
    }

    /**
     * LSPサーバーのパスを検出
     *
     * 優先順位:
     * 1. ユーザー設定のカスタムパス
     * 2. プラグインバンドル内のサーバー
     * 3. プロジェクトのnode_modules
     * 4. グローバルインストール（npm global）
     * 5. システムPATH
     */
    private fun findServerPath(settings: HelmYamlLspSettings): String {
        // 1. ユーザー設定のカスタムパス
        if (!settings.autoDetectServer && settings.serverPath.isNotEmpty()) {
            val customPath = File(settings.serverPath)
            if (customPath.exists() && customPath.isFile) {
                LOG.info("Helm YAML LSP: Using custom server path: ${customPath.absolutePath}")
                return customPath.absolutePath
            } else {
                LOG.warn("Helm YAML LSP: Custom server path not found: ${settings.serverPath}")
            }
        }

        // 2. プラグインバンドル内のサーバー
        findBundledServer()?.let {
            LOG.info("Helm YAML LSP: Using bundled server: $it")
            return it
        }

        // 3. プロジェクトのnode_modules
        findProjectNodeModules()?.let {
            LOG.info("Helm YAML LSP: Using project node_modules server: $it")
            return it
        }

        // 4. グローバルインストール（npm global）
        findGlobalNpmPackage()?.let {
            LOG.info("Helm YAML LSP: Using global npm server: $it")
            return it
        }

        // 5. システムPATH
        findInSystemPath()?.let {
            LOG.info("Helm YAML LSP: Using server from PATH: $it")
            return it
        }

        // デフォルト（見つからない場合）
        val defaultPath = "/usr/local/bin/helm-yaml-lsp-server"
        LOG.error("Helm YAML LSP: Server not found, using default: $defaultPath")
        return defaultPath
    }

    /**
     * プラグインバンドル内のサーバーを検出
     */
    private fun findBundledServer(): String? {
        try {
            // リソースディレクトリからサーバーを探す
            val classLoader = this::class.java.classLoader
            val resource = classLoader.getResource("lsp-server/server.js")
            if (resource != null) {
                val path = java.nio.file.Paths.get(resource.toURI())
                if (java.nio.file.Files.exists(path)) {
                    return path.toString()
                }
            }
        } catch (e: Exception) {
            LOG.warn("Helm YAML LSP: Failed to find bundled server", e)
        }
        return null
    }

    /**
     * プロジェクトのnode_modulesからサーバーを検出
     */
    private fun findProjectNodeModules(): String? {
        val basePath = project.basePath ?: return null
        val candidates = listOf(
            "$basePath/node_modules/helm-yaml-lsp/dist/server.js",
            "$basePath/packages/server/dist/server.js",
            "$basePath/../packages/server/dist/server.js"
        )

        for (candidate in candidates) {
            val file = File(candidate)
            if (file.exists() && file.isFile) {
                return file.absolutePath
            }
        }
        return null
    }

    /**
     * グローバルインストール（npm global）からサーバーを検出
     */
    private fun findGlobalNpmPackage(): String? {
        try {
            // npm global prefixを取得
            val process = Runtime.getRuntime().exec(arrayOf("npm", "config", "get", "prefix"))
            val prefix = process.inputStream.bufferedReader().readText().trim()

            val candidates = listOf(
                "$prefix/lib/node_modules/helm-yaml-lsp/dist/server.js",
                "$prefix/node_modules/helm-yaml-lsp/dist/server.js"
            )

            for (candidate in candidates) {
                val file = File(candidate)
                if (file.exists() && file.isFile) {
                    return file.absolutePath
                }
            }
        } catch (e: Exception) {
            LOG.warn("Helm YAML LSP: Failed to get npm global prefix", e)
        }
        return null
    }

    /**
     * システムPATHからサーバーを検出
     */
    private fun findInSystemPath(): String? {
        val pathEnv = System.getenv("PATH") ?: return null
        val separator = if (System.getProperty("os.name").startsWith("Windows")) ";" else ":"

        for (dir in pathEnv.split(separator)) {
            val candidate = File(dir, "helm-yaml-lsp-server")
            if (candidate.exists() && candidate.isFile) {
                return candidate.absolutePath
            }
        }
        return null
    }
}
