package com.anthropic.helm_yaml_lsp.settings

import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.FormBuilder
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * Helm YAML LSP Configurable
 *
 * IntelliJ設定画面でのUI実装
 * Settings > Tools > Helm YAML LSP
 */
class HelmYamlLspConfigurable : Configurable {

    private var serverPathField: TextFieldWithBrowseButton? = null
    private var autoDetectCheckbox: JBCheckBox? = null
    private var enableLoggingCheckbox: JBCheckBox? = null
    private var panel: JPanel? = null

    override fun getDisplayName(): String = "Helm YAML LSP"

    override fun createComponent(): JComponent {
        val settings = HelmYamlLspSettings.getInstance()

        serverPathField = TextFieldWithBrowseButton().apply {
            text = settings.serverPath
            addBrowseFolderListener(
                "Select LSP Server",
                "Choose the helm-yaml-lsp server.js file",
                null,
                FileChooserDescriptorFactory.createSingleFileDescriptor("js")
            )
        }

        autoDetectCheckbox = JBCheckBox("Auto-detect server path").apply {
            isSelected = settings.autoDetectServer
            addActionListener {
                serverPathField?.isEnabled = !isSelected
            }
        }

        enableLoggingCheckbox = JBCheckBox("Enable debug logging").apply {
            isSelected = settings.enableLogging
        }

        // 初期状態の設定
        serverPathField?.isEnabled = !settings.autoDetectServer

        panel = FormBuilder.createFormBuilder()
            .addComponent(autoDetectCheckbox!!, 1)
            .addLabeledComponent(
                JBLabel("LSP Server Path:"),
                serverPathField!!,
                1,
                false
            )
            .addComponent(enableLoggingCheckbox!!, 1)
            .addComponentFillVertically(JPanel(), 0)
            .panel

        return panel!!
    }

    override fun isModified(): Boolean {
        val settings = HelmYamlLspSettings.getInstance()
        return serverPathField?.text != settings.serverPath ||
               autoDetectCheckbox?.isSelected != settings.autoDetectServer ||
               enableLoggingCheckbox?.isSelected != settings.enableLogging
    }

    override fun apply() {
        val settings = HelmYamlLspSettings.getInstance()
        settings.serverPath = serverPathField?.text ?: ""
        settings.autoDetectServer = autoDetectCheckbox?.isSelected ?: true
        settings.enableLogging = enableLoggingCheckbox?.isSelected ?: false
    }

    override fun reset() {
        val settings = HelmYamlLspSettings.getInstance()
        serverPathField?.text = settings.serverPath
        autoDetectCheckbox?.isSelected = settings.autoDetectServer
        enableLoggingCheckbox?.isSelected = settings.enableLogging
        serverPathField?.isEnabled = !settings.autoDetectServer
    }
}
