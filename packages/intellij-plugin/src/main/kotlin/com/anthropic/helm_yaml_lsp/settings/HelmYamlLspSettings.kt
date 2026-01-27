package com.anthropic.helm_yaml_lsp.settings

import com.intellij.openapi.components.*
import com.intellij.util.xmlb.XmlSerializerUtil

/**
 * Helm YAML LSP Settings
 *
 * プラグインの設定を永続化します。
 */
@Service
@State(
    name = "HelmYamlLspSettings",
    storages = [Storage("HelmYamlLspSettings.xml")]
)
class HelmYamlLspSettings : PersistentStateComponent<HelmYamlLspSettings> {

    /**
     * LSPサーバーのカスタムパス
     */
    var serverPath: String = ""

    /**
     * サーバーパスの自動検出を有効にするか
     */
    var autoDetectServer: Boolean = true

    /**
     * デバッグログを有効にするか
     */
    var enableLogging: Boolean = false

    override fun getState(): HelmYamlLspSettings = this

    override fun loadState(state: HelmYamlLspSettings) {
        XmlSerializerUtil.copyBean(state, this)
    }

    companion object {
        fun getInstance(): HelmYamlLspSettings {
            return service()
        }
    }
}
