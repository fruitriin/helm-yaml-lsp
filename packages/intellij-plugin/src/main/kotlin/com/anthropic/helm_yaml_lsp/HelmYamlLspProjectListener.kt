package com.anthropic.helm_yaml_lsp

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManagerListener

/**
 * Helm YAML LSP Project Listener
 *
 * プロジェクトの開閉を監視してLSPサーバーのライフサイクルを管理します。
 * LSPサーバーは IntelliJ Platform が自動的に管理するため、
 * このリスナーは主にログ出力のために使用します。
 */
class HelmYamlLspProjectListener : ProjectManagerListener {

    companion object {
        private val LOG = Logger.getInstance(HelmYamlLspProjectListener::class.java)
    }

    override fun projectOpened(project: Project) {
        LOG.info("Helm YAML LSP: Project opened - ${project.name}")
    }

    override fun projectClosed(project: Project) {
        LOG.info("Helm YAML LSP: Project closed - ${project.name}")
    }
}
