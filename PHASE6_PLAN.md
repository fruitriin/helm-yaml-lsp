# Phase 6 実装計画: IntelliJ Plugin Support

**最終更新**: 2026-01-27

## 概要

Phase 5でConfigMap/Secretサポートの実装が完了しました。Phase 6では、IntelliJ IDEAおよびJetBrains製品向けのプラグインを実装し、より多くの開発者がLSPサーバーを利用できるようにします。

**Phase 5完了時点での状態**:
- ✅ Argo Workflows LSP機能（Phase 2-3）
- ✅ Helm機能のフルサポート（Phase 4）
- ✅ ConfigMap/Secretのフルサポート（Phase 5）
- ✅ 440 tests passed
- ✅ VSCode拡張実装済み
- ✅ Neovimクライアント実装済み
- ✅ エディタ非依存のLSPサーバー

**Phase 6の目標**:
IntelliJ IDEA向けのプラグインを実装し、JetBrains製品（IntelliJ IDEA、PyCharm、WebStorm等）でLSPサーバーを利用可能にする。

---

## アーキテクチャ概要

### エディタ対応状況

```
helm-yaml-lsp/
├── packages/server/           # ✅ LSPサーバー（エディタ非依存）
├── packages/vscode-client/    # ✅ VSCode拡張
├── packages/nvim-client/      # ✅ Neovimクライアント
└── packages/intellij-plugin/  # 🆕 IntelliJ Plugin（Phase 6）
```

### IntelliJ LSP統合の選択肢

IntelliJでLSPサーバーを統合する方法は主に3つあります：

#### 選択肢A: IntelliJ Platform標準のLSPサポート（推奨）⭐
- **言語**: Kotlin/Java
- **メリット**:
  - IntelliJ Platform 2023.2以降に標準搭載
  - 外部ライブラリへの依存なし
  - 公式にサポートされている
  - ビルド・依存関係がシンプル
  - すべてのJetBrains製品で動作
  - LSPプロトコルを直接実装
- **デメリット**:
  - ドキュメントが少ない
  - LSPクライアント実装が必要
- **実装ツール**:
  - Gradle
  - IntelliJ Platform Plugin SDK
  - `com.intellij.platform.lsp.api`パッケージ

#### 選択肢B: LSP4IJ library
- **メリット**:
  - Red Hat製の成熟したライブラリ
  - 高レベルAPIで実装が簡単
- **デメリット**:
  - 外部ライブラリへの依存
  - バージョン互換性の問題
  - ビルドサイズの増加
- GitHubプロジェクト: [redhat-developer/lsp4ij](https://github.com/redhat-developer/lsp4ij)

#### 選択肢C: 独自のLSPクライアント実装
- LSPプロトコルを完全に独自実装
- 最大限の柔軟性
- 実装コストが高い

**Phase 6では選択肢A（IntelliJ Platform標準LSP）を採用**します。理由：
1. 外部依存がなく、ビルドがシンプル
2. 長期的なメンテナンス性
3. IntelliJ Platform標準機能として安定している
4. プラグインサイズの削減
5. JetBrainsエコシステムとの完全な親和性

---

## Phase 6.1: IntelliJ Plugin基本構造のセットアップ

### 目的

IntelliJ Pluginプロジェクトの基本構造を作成し、ビルド環境を整える。

### 実装内容

#### 6.1.1 プロジェクト構造の作成

**ディレクトリ構造**:
```
packages/intellij-plugin/
├── build.gradle.kts          # Gradleビルド設定
├── settings.gradle.kts       # Gradleプロジェクト設定
├── gradle.properties         # プロパティ設定
├── src/
│   ├── main/
│   │   ├── kotlin/           # Kotlinソースコード
│   │   │   └── com/anthropic/helm_yaml_lsp/
│   │   │       ├── HelmYamlLspPlugin.kt
│   │   │       ├── settings/
│   │   │       │   └── HelmYamlLspSettings.kt
│   │   │       └── lsp/
│   │   │           └── HelmYamlLspServer.kt
│   │   └── resources/
│   │       └── META-INF/
│   │           └── plugin.xml  # プラグイン定義
│   └── test/
│       └── kotlin/
└── README.md
```

#### 6.1.2 build.gradle.kts

**ファイル**: `packages/intellij-plugin/build.gradle.kts`

```kotlin
plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.22"
    id("org.jetbrains.intellij") version "1.17.0"
}

group = "com.anthropic"
version = "0.1.0"

repositories {
    mavenCentral()
}

// 依存関係: IntelliJ Platform標準のLSPサポートを使用（外部依存なし）
dependencies {
    // IntelliJ Platform SDKに標準搭載されているため、追加依存不要
}

intellij {
    version.set("2023.3")  // LSP標準サポートが含まれる最小バージョン
    type.set("IC")         // IntelliJ IDEA Community Edition

    // プラグイン依存なし（IntelliJ Platform標準機能を使用）
    plugins.set(listOf())
}

tasks {
    withType<JavaCompile> {
        sourceCompatibility = "17"
        targetCompatibility = "17"
    }

    withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
        kotlinOptions.jvmTarget = "17"
    }

    patchPluginXml {
        sinceBuild.set("233")
        untilBuild.set("241.*")
    }

    signPlugin {
        certificateChain.set(System.getenv("CERTIFICATE_CHAIN"))
        privateKey.set(System.getenv("PRIVATE_KEY"))
        password.set(System.getenv("PRIVATE_KEY_PASSWORD"))
    }

    publishPlugin {
        token.set(System.getenv("PUBLISH_TOKEN"))
    }
}
```

#### 6.1.3 plugin.xml

**ファイル**: `packages/intellij-plugin/src/main/resources/META-INF/plugin.xml`

```xml
<idea-plugin>
    <id>com.anthropic.helm-yaml-lsp</id>
    <name>Helm YAML LSP</name>
    <vendor email="support@anthropic.com" url="https://anthropic.com">Anthropic</vendor>

    <description><![CDATA[
    Language Server Protocol support for Helm, Argo Workflows, and Kubernetes YAML files.

    Features:
    - Go to definition for templates, values, ConfigMaps, and Secrets
    - Hover information
    - Auto-completion
    - Error diagnostics

    Supports:
    - Argo Workflows templates
    - Helm chart templates and values
    - ConfigMap and Secret references
    ]]></description>

    <!-- 依存: IntelliJ Platformの標準モジュールのみ -->
    <depends>com.intellij.modules.platform</depends>

    <extensions defaultExtensionNs="com.intellij">
        <!-- LSPサーバー定義 (IntelliJ Platform標準API) -->
        <platform.lsp.serverSupportProvider
            implementation="com.anthropic.helm_yaml_lsp.lsp.HelmYamlLspServerSupportProvider"/>

        <!-- 設定画面 -->
        <applicationConfigurable
            instance="com.anthropic.helm_yaml_lsp.settings.HelmYamlLspConfigurable"/>
    </extensions>

    <projectListeners>
        <listener
            class="com.anthropic.helm_yaml_lsp.HelmYamlLspProjectListener"
            topic="com.intellij.openapi.project.ProjectManagerListener"/>
    </projectListeners>
</idea-plugin>
```

#### 6.1.4 実装タスク

- [ ] Gradleプロジェクト作成
- [ ] plugin.xml作成
- [ ] 基本的なPluginクラス実装
- [ ] ビルド確認（`./gradlew build`）
- [ ] IntelliJ IDEAでのプラグイン読み込み確認

#### 6.1.5 成功基準

- [ ] `./gradlew build` が成功する
- [ ] IntelliJ IDEAでプラグインが認識される
- [ ] プラグインの有効化/無効化ができる

---

## Phase 6.2: LSP Client実装

### 目的

IntelliJ Platform標準のLSP APIを使用してLSPサーバーと通信するクライアントを実装する。

### 実装内容

#### 6.2.1 LSPサーバーサポートプロバイダー

**ファイル**: `packages/intellij-plugin/src/main/kotlin/com/anthropic/helm_yaml_lsp/lsp/HelmYamlLspServerSupportProvider.kt`

```kotlin
package com.anthropic.helm_yaml_lsp.lsp

import com.anthropic.helm_yaml_lsp.settings.HelmYamlLspSettings
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.lsp.api.LspServerSupportProvider
import com.intellij.platform.lsp.api.ProjectWideLspServerDescriptor
import java.io.File

/**
 * Helm YAML LSP Server Support Provider
 *
 * IntelliJ Platform標準のLSP APIを使用してLSPサーバーをサポートします。
 */
class HelmYamlLspServerSupportProvider : LspServerSupportProvider {

    override fun fileOpened(
        project: Project,
        file: VirtualFile,
        serverStarter: LspServerSupportProvider.LspServerStarter
    ) {
        // YAMLファイルかつHelm/Argo Workflowsファイルの場合にLSPサーバーを起動
        if (isHelmOrArgoFile(file)) {
            serverStarter.ensureServerStarted(HelmYamlLspServerDescriptor(project))
        }
    }

    private fun isHelmOrArgoFile(file: VirtualFile): Boolean {
        // .yaml または .yml ファイルのみ対象
        if (file.extension !in listOf("yaml", "yml")) {
            return false
        }

        // ファイル内容を簡易チェック（パフォーマンスのため最初の1000文字のみ）
        try {
            val content = String(file.contentsToByteArray()).take(1000)
            return content.contains("argoproj.io") ||
                   content.contains("kind: Workflow") ||
                   content.contains("kind: WorkflowTemplate") ||
                   content.contains("kind: ClusterWorkflowTemplate") ||
                   file.path.contains("/templates/") // Helm templates
        } catch (e: Exception) {
            return false
        }
    }
}

/**
 * Helm YAML LSP Server Descriptor
 *
 * LSPサーバーの起動方法を定義します。
 */
class HelmYamlLspServerDescriptor(project: Project) : ProjectWideLspServerDescriptor(project, "Helm YAML LSP") {

    override fun isSupportedFile(file: VirtualFile): Boolean {
        return file.extension in listOf("yaml", "yml")
    }

    override fun createCommandLine(): GeneralCommandLine {
        val settings = HelmYamlLspSettings.getInstance()
        val serverPath = findServerPath(settings)

        return GeneralCommandLine().apply {
            exePath = "node"
            addParameter(serverPath)
            withCharset(Charsets.UTF_8)
        }
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
                return customPath.absolutePath
            }
        }

        // 2. プラグインバンドル内のサーバー
        findBundledServer()?.let { return it }

        // 3. プロジェクトのnode_modules
        findProjectNodeModules()?.let { return it }

        // 4. グローバルインストール（npm global）
        findGlobalNpmPackage()?.let { return it }

        // 5. システムPATH
        findInSystemPath()?.let { return it }

        // デフォルト（見つからない場合）
        return "/usr/local/bin/helm-yaml-lsp-server"
    }

    private fun findBundledServer(): String? {
        // プラグインリソースからサーバーを探す
        // 実装詳細は省略（Phase 6.1実装済みコードを参照）
        return null
    }

    private fun findProjectNodeModules(): String? {
        val basePath = project.basePath ?: return null
        val candidates = listOf(
            "$basePath/node_modules/helm-yaml-lsp/dist/server.js",
            "$basePath/packages/server/dist/server.js"
        )
        return candidates.firstOrNull { File(it).exists() }
    }

    private fun findGlobalNpmPackage(): String? {
        // npm global prefixから検出（実装詳細は省略）
        return null
    }

    private fun findInSystemPath(): String? {
        // システムPATHから検出（実装詳細は省略）
        return null
    }
}
```

#### 6.2.2 プロジェクトリスナー（オプション）

LSPサーバーのライフサイクル管理のため、プロジェクトリスナーを実装します。

**ファイル**: `packages/intellij-plugin/src/main/kotlin/com/anthropic/helm_yaml_lsp/HelmYamlLspProjectListener.kt`

```kotlin
package com.anthropic.helm_yaml_lsp

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManagerListener

/**
 * プロジェクトの開閉を監視してLSPサーバーのライフサイクルを管理
 */
class HelmYamlLspProjectListener : ProjectManagerListener {

    companion object {
        private val LOG = Logger.getInstance(HelmYamlLspProjectListener::class.java)
    }

    override fun projectOpened(project: Project) {
        LOG.info("Project opened: ${project.name}")
        // LSPサーバーは LspServerSupportProvider で自動起動されるため、
        // ここでは特別な処理は不要
    }

    override fun projectClosed(project: Project) {
        LOG.info("Project closed: ${project.name}")
        // LSPサーバーは IntelliJ Platform が自動的に停止する
    }
}
```

#### 6.2.3 実装タスク

- [ ] HelmYamlLspServerSupportProvider実装
- [ ] HelmYamlLspServerDescriptor実装
- [ ] サーバーパス検出ロジック実装（5段階の優先順位）
- [ ] ファイル判定ロジック実装（isHelmOrArgoFile）
- [ ] プロジェクトリスナー実装（オプション）

#### 6.2.4 テスト内容

- [ ] LSPサーバーが起動する
- [ ] YAMLファイルでLSP機能が有効になる
- [ ] textDocument/definitionが動作する
- [ ] textDocument/hoverが動作する

---

## Phase 6.3: 設定UI実装

### 目的

ユーザーがLSPサーバーのパスを設定できるUIを提供する。

### 実装内容

#### 6.3.1 設定データクラス

**ファイル**: `packages/intellij-plugin/src/main/kotlin/com/anthropic/helm_yaml_lsp/settings/HelmYamlLspSettings.kt`

```kotlin
package com.anthropic.helm_yaml_lsp.settings

import com.intellij.openapi.components.*
import com.intellij.util.xmlb.XmlSerializerUtil

@State(
    name = "HelmYamlLspSettings",
    storages = [Storage("HelmYamlLspSettings.xml")]
)
class HelmYamlLspSettings : PersistentStateComponent<HelmYamlLspSettings> {

    var serverPath: String = ""
    var autoDetectServer: Boolean = true
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
```

#### 6.3.2 設定UI

**ファイル**: `packages/intellij-plugin/src/main/kotlin/com/anthropic/helm_yaml_lsp/settings/HelmYamlLspConfigurable.kt`

```kotlin
package com.anthropic.helm_yaml_lsp.settings

import com.intellij.openapi.options.Configurable
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.FormBuilder
import javax.swing.JComponent
import javax.swing.JPanel

class HelmYamlLspConfigurable : Configurable {

    private var serverPathField: TextFieldWithBrowseButton? = null
    private var autoDetectCheckbox: JBCheckBox? = null
    private var enableLoggingCheckbox: JBCheckBox? = null
    private var panel: JPanel? = null

    override fun getDisplayName(): String = "Helm YAML LSP"

    override fun createComponent(): JComponent? {
        val settings = HelmYamlLspSettings.getInstance()

        serverPathField = TextFieldWithBrowseButton().apply {
            text = settings.serverPath
        }

        autoDetectCheckbox = JBCheckBox("Auto-detect server path").apply {
            isSelected = settings.autoDetectServer
        }

        enableLoggingCheckbox = JBCheckBox("Enable debug logging").apply {
            isSelected = settings.enableLogging
        }

        panel = FormBuilder.createFormBuilder()
            .addLabeledComponent(
                JBLabel("LSP Server Path:"),
                serverPathField!!,
                1,
                false
            )
            .addComponent(autoDetectCheckbox!!, 1)
            .addComponent(enableLoggingCheckbox!!, 1)
            .addComponentFillVertically(JPanel(), 0)
            .panel

        return panel
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
    }
}
```

#### 6.3.3 実装タスク

- [ ] 設定データクラス実装
- [ ] 設定UI実装
- [ ] サーバーパス自動検出ロジック
- [ ] 設定の永続化

#### 6.3.4 テスト内容

- [ ] Settings画面が開ける
- [ ] サーバーパスの設定が保存される
- [ ] 設定変更がLSPサーバーに反映される

---

## Phase 6.4: ビルド・パッケージング

### 目的

プラグインをビルドし、配布可能な形式にパッケージングする。

### 実装内容

#### 6.4.1 LSPサーバーのバンドル

プラグインにLSPサーバーをバンドルするため、`buildPlugin`タスクをカスタマイズ：

```kotlin
tasks {
    buildPlugin {
        doFirst {
            // packages/server/dist/server.js をプラグインにコピー
            copy {
                from("../server/dist/")
                into("$buildDir/resources/main/lsp-server/")
                include("server.js", "server.js.map")
            }
        }
    }
}
```

#### 6.4.2 配布用ZIPの作成

```bash
./gradlew buildPlugin
```

成果物: `build/distributions/helm-yaml-lsp-0.1.0.zip`

#### 6.4.3 実装タスク

- [ ] LSPサーバーをプラグインにバンドル
- [ ] ビルドスクリプトの最適化
- [ ] ZIPパッケージの生成確認
- [ ] プラグインサイズの最適化

#### 6.4.4 成功基準

- [ ] `./gradlew buildPlugin` が成功する
- [ ] 生成されたZIPからプラグインがインストールできる
- [ ] バンドルされたLSPサーバーが正常に起動する

---

## Phase 6.5: テストと動作確認

### 目的

IntelliJ IDEAでプラグインの全機能を検証する。

### テスト内容

#### 6.5.1 基本機能テスト

**Definition Provider:**
- [ ] Argo Workflowのテンプレート参照からジャンプ
- [ ] Helm .Values参照からvalues.yamlへジャンプ
- [ ] ConfigMap/Secret参照からジャンプ

**Hover Provider:**
- [ ] テンプレート参照のホバー情報表示
- [ ] .Values参照のホバー情報表示
- [ ] ConfigMap/Secret参照のホバー情報表示

**Completion Provider:**
- [ ] テンプレート名の補完
- [ ] .Values参照の補完
- [ ] ConfigMap/Secret名の補完

**Diagnostics:**
- [ ] 存在しないテンプレート参照のエラー表示
- [ ] 存在しない.Values参照のエラー表示
- [ ] 存在しないConfigMap参照のエラー表示

#### 6.5.2 統合テスト

- [ ] samples/argo/workflow-templateref.yamlで全機能動作
- [ ] samples/helm/templates/workflow.yamlで全機能動作
- [ ] samples/argo/workflow-configmap.yamlで全機能動作

#### 6.5.3 パフォーマンステスト

- [ ] 大規模プロジェクト（100+ YAMLファイル）での動作
- [ ] LSPサーバーの起動時間（< 3秒）
- [ ] メモリ使用量（< 200MB）

---

## Phase 6.6: JetBrains Marketplace公開準備

### 目的

JetBrains Marketplaceにプラグインを公開する準備を整える。

### 実装内容

#### 6.6.1 ドキュメント作成

**README.md:**
- プラグインの説明
- インストール方法
- 使用方法
- スクリーンショット

**CHANGELOG.md:**
- バージョン履歴
- 変更内容

#### 6.6.2 アイコン・スクリーンショット

- [ ] プラグインアイコン（SVG）
- [ ] 機能のスクリーンショット（3-5枚）
- [ ] デモGIF/動画

#### 6.6.3 Marketplace登録

1. [JetBrains Marketplace](https://plugins.jetbrains.com/)でアカウント作成
2. プラグイン情報の登録
3. ZIPファイルのアップロード
4. レビュー待ち

#### 6.6.4 実装タスク

- [ ] README.md作成
- [ ] CHANGELOG.md作成
- [ ] プラグインアイコン作成
- [ ] スクリーンショット作成
- [ ] Marketplace登録

---

## Phase 6完了基準

Phase 6が完了したと判断する基準：

### 必須項目

- [ ] IntelliJ IDEAでプラグインがインストールできる
- [ ] すべてのLSP機能が動作する（Definition/Hover/Completion/Diagnostics）
- [ ] 設定UIでサーバーパスを変更できる
- [ ] プラグインが安定して動作する（クラッシュなし）
- [ ] Gradleビルドが成功する
- [ ] ドキュメントが整備されている

### 推奨項目

- [ ] JetBrains Marketplaceに公開
- [ ] 複数のJetBrains製品でテスト（PyCharm、WebStorm）
- [ ] ユーザーフィードバックの収集
- [ ] パフォーマンス最適化

---

## プロジェクト構造（Phase 6完了後）

```
helm-yaml-lsp/
├── packages/
│   ├── server/              # ✅ LSPサーバー
│   ├── vscode-client/       # ✅ VSCode拡張
│   ├── nvim-client/         # ✅ Neovimクライアント
│   └── intellij-plugin/     # 🆕 IntelliJ Plugin
│       ├── build.gradle.kts
│       ├── settings.gradle.kts
│       ├── gradle.properties
│       ├── src/
│       │   ├── main/
│       │   │   ├── kotlin/
│       │   │   │   └── com/anthropic/helm_yaml_lsp/
│       │   │   │       ├── HelmYamlLspPlugin.kt
│       │   │   │       ├── ArgoWorkflowFileType.kt
│       │   │   │       ├── settings/
│       │   │   │       │   ├── HelmYamlLspSettings.kt
│       │   │   │       │   └── HelmYamlLspConfigurable.kt
│       │   │   │       └── lsp/
│       │   │   │           ├── HelmYamlLspServerDefinition.kt
│       │   │   │           ├── HelmYamlLspStreamConnectionProvider.kt
│       │   │   │           └── HelmYamlLspLanguageClient.kt
│       │   │   └── resources/
│       │   │       ├── META-INF/
│       │   │       │   └── plugin.xml
│       │   │       └── lsp-server/
│       │   │           └── server.js (バンドル)
│       │   └── test/
│       │       └── kotlin/
│       ├── README.md
│       └── CHANGELOG.md
├── samples/
├── PHASE6_PLAN.md           # 🆕 このファイル
├── progress.md
└── README.md
```

---

## 技術的な考慮事項

### IntelliJ Platform標準LSP APIの選択理由

1. **公式サポート**: IntelliJ Platform 2023.2以降に標準搭載
2. **外部依存なし**: プラグインサイズが小さく、依存関係の問題がない
3. **機能**: LSP仕様の完全サポート
4. **安定性**: JetBrainsが直接メンテナンス
5. **パフォーマンス**: プラットフォームに最適化された実装

### サーバーパス検出戦略

優先順位：
1. ユーザー設定のカスタムパス
2. プラグインバンドルのサーバー
3. ワークスペース内のnode_modules
4. グローバルインストール（npm global）
5. システムPATH

### パフォーマンス最適化

- LSPサーバーはプロジェクトごとに1インスタンス
- ファイル変更時の差分更新
- インデックスのキャッシング
- 非同期処理の活用

---

## リスクと対応

### リスク1: IntelliJ Platform バージョン互換性

**リスク**: IntelliJ Platform 2023.2未満のバージョンではLSP標準APIが利用できない

**対応**:
- plugin.xmlで最小バージョンを2023.2に設定
- sinceBuild="233"（IntelliJ IDEA 2023.3）を指定
- 古いバージョンのサポートが必要な場合はLSP4IJへのフォールバック検討

### リスク2: Gradleビルドの複雑性

**リスク**: Gradleビルド設定が複雑で保守が困難

**対応**:
- ビルドスクリプトのドキュメント化
- CI/CDでのビルド自動化
- サンプルプロジェクトの参照

### リスク3: JetBrains製品間の互換性

**リスク**: IntelliJ IDEA以外の製品で動作しない

**対応**:
- 複数の製品でテスト（PyCharm、WebStorm）
- plugin.xmlでサポート製品を明示
- 製品固有の問題に対応

---

## 次のフェーズ候補（Phase 7以降）

Phase 6完了後は以下を検討：

### Phase 7: 高度な機能

- **リファクタリング（リネーム）**
  - テンプレート名の一括リネーム
  - パラメータ名の一括リネーム
  - .Values参照の一括リネーム

- **コードアクション**
  - 存在しないテンプレートを自動作成
  - 存在しない.Values定義を自動追加
  - ConfigMap/Secretの自動生成

- **ドキュメントシンボル**
  - アウトライン表示
  - パンくずリスト
  - 構造化ビュー

- **ワークスペースシンボル検索**
  - グローバルテンプレート検索
  - グローバル.Values検索
  - ConfigMap/Secret検索

### Phase 8: パフォーマンス最適化とリリース準備

- プロファイリングと最適化
- 大規模プロジェクトでのベンチマーク
- エラーハンドリングの改善
- ロギング機能の強化
- VSCode Marketplace公開
- JetBrains Marketplace公開
- ドキュメント整備
- デモ動画作成

---

## 参考リソース

### IntelliJ Plugin開発

- [IntelliJ Platform Plugin SDK](https://plugins.jetbrains.com/docs/intellij/welcome.html)
- [Kotlin for Plugin Developers](https://plugins.jetbrains.com/docs/intellij/using-kotlin.html)
- [IntelliJ Platform LSP API](https://plugins.jetbrains.com/docs/intellij/language-server-protocol.html) - 標準LSPサポート
- [LSP API Source Code](https://github.com/JetBrains/intellij-community/tree/master/platform/platform-lsp-api) - `com.intellij.platform.lsp.api`パッケージ

### LSPプロトコル

- [Language Server Protocol Specification](https://microsoft.github.io/language-server-protocol/)
- [LSP Implementation Guide](https://github.com/Microsoft/language-server-protocol/wiki/Protocol-Implementation-Guide)

### Gradle

- [Gradle Plugin Development](https://docs.gradle.org/current/userguide/custom_plugins.html)
- [IntelliJ Gradle Plugin](https://github.com/JetBrains/gradle-intellij-plugin)

---

## まとめ

Phase 6では、IntelliJ IDEA向けのプラグインを**IntelliJ Platform標準のLSP API**を使用して実装し、JetBrainsエコシステムへのサポートを追加します。

### 実装アプローチの特徴

✅ **外部依存なし**: LSP4IJなどの外部ライブラリに依存せず、IntelliJ Platform標準APIのみを使用
✅ **シンプルなビルド**: Gradleの依存関係がシンプルで、ビルドが高速
✅ **プラグインサイズ削減**: 外部ライブラリをバンドルしないため、プラグインサイズが小さい
✅ **長期サポート**: JetBrainsが直接メンテナンスする標準APIのため、互換性が安定
✅ **完全なLSP統合**: 既存のLSPサーバー（packages/server）をそのまま利用可能

### アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│  IntelliJ IDEA / PyCharm / WebStorm                     │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Helm YAML LSP Plugin                             │  │
│  │  ┌──────────────────────────────────────────────┐ │  │
│  │  │  HelmYamlLspServerSupportProvider           │ │  │
│  │  │  - ファイル判定（YAML + Helm/Argo）         │ │  │
│  │  │  - LSPサーバー起動管理                      │ │  │
│  │  └──────────────────────────────────────────────┘ │  │
│  │  ┌──────────────────────────────────────────────┐ │  │
│  │  │  HelmYamlLspServerDescriptor                │ │  │
│  │  │  - サーバーパス検出                         │ │  │
│  │  │  - プロセス起動（node server.js）          │ │  │
│  │  └──────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  IntelliJ Platform LSP API (標準)                │  │
│  │  - LspServerSupportProvider                       │  │
│  │  - ProjectWideLspServerDescriptor                 │  │
│  │  - LSPプロトコル実装                              │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                      ↕ LSP Protocol (stdio)
┌─────────────────────────────────────────────────────────┐
│  LSP Server (Node.js)                                   │
│  - packages/server/dist/server.js                       │
│  - VSCode / Neovim / IntelliJ共通                       │
└─────────────────────────────────────────────────────────┘
```

**Phase 6完了後のプロジェクト状態**:
- ✅ Argo Workflows LSP機能（Phase 2-3）
- ✅ Helm機能のフルサポート（Phase 4）
- ✅ ConfigMap/Secretのフルサポート（Phase 5）
- ✅ VSCode拡張（Phase 1）
- ✅ Neovimクライアント（Phase 1）
- ✅ IntelliJ Plugin（Phase 6） - **IntelliJ Platform標準LSP API使用**
- ✅ 440+ tests
- ✅ 3つの主要エディタをサポート
- ✅ 完全にエディタ非依存のLSPサーバー

これにより、より多くの開発者がArgo Workflows、Helm、Kubernetesの開発を快適に行えるようになります。
