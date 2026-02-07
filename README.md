# Helm YAML LSP

Argo Workflows Language Server Protocol implementation for Helm and YAML files.

**現在のステータス**: Phase 11 完了 ✅ | 596 tests passed

📋 **開発進捗**: [progress.md](./progress.md)
📘 **開発ガイド**: [CLAUDE.md](./CLAUDE.md)
🗺️ **計画書**: [PHASE1](./PHASE1_PLAN.md) | [PHASE2](./PHASE2_PLAN.md) | [PHASE3](./PHASE3_PLAN.md) | [PHASE4](./PHASE4_PLAN.md) | [PHASE5](./PHASE5_PLAN.md) | [PHASE6](./PHASE6_PLAN.md) | [PHASE8](./PHASE8_PLAN.md) | [PHASE9](./PHASE9_PLAN.md) | [PHASE10](./PHASE10_PLAN.md) | [PHASE11](./PHASE11_PLAN.md)

---

## 概要

VSCode拡張機能から独立したLSPサーバーとして、Argo Workflows、Helm、Kubernetes YAMLファイルに対する高度な編集支援機能を提供します。

### 対応エディタ

- **VSCode** - 主要ターゲット（実装済み ✅）
- **Neovim** - nvim-lspconfig経由（実装済み ✅）
- **IntelliJ IDEA / JetBrains** - プラグイン開発中（基本実装完了 🔨）
- **その他** - LSP標準プロトコルに準拠した任意のエディタ

### 実装済み機能

✅ **Argo Workflows機能**
- WorkflowTemplate/ClusterWorkflowTemplateの自動インデックス化
- `templateRef`参照から定義へのジャンプ
- ローカルテンプレート参照（同一ファイル内）
- パラメータ定義と参照（inputs/outputs.parameters）
- アーティファクト参照（inputs/outputs.artifacts、steps/tasks.outputs.artifacts）
- スクリプト結果参照（steps/tasks.outputs.result）
- Item変数（`{{item}}`, `{{item.xxx}}`）とwithItems/withParamソースへのジャンプ
- Workflow変数のサポート（workflow.name等10種 + サブプロパティ）
- Workflow出力参照（workflow.outputs.parameters/artifacts）

✅ **Helm機能**
- Helm Chart構造の自動検出
- values.yamlの解析とインデックス化
- `.Values`参照のサポート（Definition/Hover/Completion/Diagnostics）
- `{{ include }}` / `{{ template }}`関数のサポート
- Helm組み込み関数のサポート（70+ functions）
- `.Chart`, `.Release`, `.Capabilities`変数のサポート
- _helpers.tplファイルのサポート
- **Document Symbol**: YAMLアウトライン表示（マルチドキュメント対応）
- **Document Highlight**: Helmブロック構造（if/range/with/define/end）の対応タグハイライト

✅ **ConfigMap/Secret機能**
- ConfigMap/Secret定義の自動検出
- `configMapKeyRef` / `secretKeyRef`参照のサポート
- `configMapRef` / `secretRef`（envFrom）のサポート
- `volumeConfigMap` / `volumeSecret`のサポート
- マルチライン値のプレビュー表示

✅ **LSP機能**
- **Definition Provider**: 定義へのジャンプ（F12 / gd）
- **Hover Provider**: ホバー情報の表示
- **Completion Provider**: 入力補完
- **Diagnostic Provider**: エラー検出と表示
- **Document Symbol Provider**: ドキュメントアウトライン（Ctrl+Shift+O / :SymbolsOutline）
- **Document Highlight Provider**: 対応ブロックのハイライト表示

**操作方法**:
- VSCode: `F12`（定義へ移動）、ホバー、Ctrl+Space（補完）
- Neovim: `gd`（定義へ移動）、`K`（ホバー）、LSP補完

---

## サポート構文

### Argo Workflows構文 ✅

#### 1. WorkflowTemplate参照

```yaml
# WorkflowTemplate定義（別ファイル）
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: my-template
spec:
  templates:
    - name: hello          # ← ジャンプ先
      container:
        image: alpine
```

```yaml
# Workflow（参照元）
apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - name: step1
            templateRef:
              name: my-template
              template: hello   # ← F12/gd でジャンプ可能 ✅
```

#### 2. ClusterWorkflowTemplate参照 ✅

```yaml
# ClusterWorkflowTemplate定義
apiVersion: argoproj.io/v1alpha1
kind: ClusterWorkflowTemplate
metadata:
  name: cluster-template
spec:
  templates:
    - name: world         # ← ジャンプ先
```

```yaml
# Workflow（参照元）
templateRef:
  name: cluster-template
  template: world         # ← F12/gd でジャンプ可能 ✅
  clusterScope: true
```

#### 3. ローカルテンプレート参照 ✅

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - template: hello   # ← ジャンプ可能 ✅

    - name: hello             # ← ジャンプ先
      container:
        image: alpine
```

#### 4. パラメータ参照 ✅

```yaml
spec:
  templates:
    - name: main
      inputs:
        parameters:
          - name: message     # ← 定義（ジャンプ先） ✅
            default: "Hello"
      container:
        image: alpine
        args:
          - "{{inputs.parameters.message}}"  # ← 参照（ジャンプ、ホバー、補完） ✅
```

#### 5. Workflow変数 ✅

```yaml
# 以下の変数をサポート（ホバーで説明表示、補完可能）
{{workflow.name}}                    # Workflow名
{{workflow.namespace}}               # 名前空間
{{workflow.uid}}                     # Workflow UID
{{workflow.parameters.xxx}}          # Workflowパラメータ → 定義ジャンプ対応
{{workflow.serviceAccountName}}      # サービスアカウント
{{workflow.creationTimestamp}}       # 作成日時
{{workflow.duration}}                # 実行時間
{{workflow.priority}}                # 優先度
{{workflow.status}}                  # ステータス
{{workflow.mainEntrypoint}}          # メインエントリポイント
{{workflow.scheduledTime}}           # スケジュール実行時刻（CronWorkflow）
{{workflow.labels.xxx}}              # ラベル → 定義ジャンプ対応
{{workflow.annotations.xxx}}         # アノテーション → 定義ジャンプ対応
{{workflow.outputs.parameters.xxx}}  # Workflow出力パラメータ
{{workflow.outputs.artifacts.xxx}}   # Workflow出力アーティファクト
```

#### 6. アーティファクト参照 ✅

```yaml
spec:
  templates:
    - name: generate
      outputs:
        artifacts:
          - name: data-file      # ← 定義（ジャンプ先） ✅
            path: /tmp/data.txt
      container:
        image: alpine
        command: ["sh", "-c", "echo data > /tmp/data.txt"]

    - name: consume
      inputs:
        artifacts:
          - name: input-data     # ← 定義（ジャンプ先） ✅
            path: /tmp/input
      container:
        args:
          - "{{inputs.artifacts.input-data}}"  # ← ホバー、ジャンプ、補完 ✅

    - name: main
      steps:
        - - name: gen
            template: generate
        - - name: use
            template: consume
            arguments:
              artifacts:
                - name: input-data
                  from: "{{steps.gen.outputs.artifacts.data-file}}"  # ← ホバー、ジャンプ ✅
```

#### 7. スクリプト結果参照 ✅

```yaml
spec:
  templates:
    - name: gen-random
      script:
        image: python:3.9       # ← 言語: python として検出
        command: [python]
        source: |
          import random
          print(random.randint(1, 100))  # stdout最終行がresult

    - name: main
      steps:
        - - name: generate
            template: gen-random
        - - name: use
            arguments:
              parameters:
                - name: value
                  value: "{{steps.generate.outputs.result}}"  # ← ホバー（言語情報付き）、ジャンプ ✅
```

#### 8. Item変数 ✅

```yaml
spec:
  templates:
    - name: loop
      steps:
        - - name: process
            template: echo
            arguments:
              parameters:
                - name: msg
                  value: "{{item.name}}: {{item.value}}"  # ← ホバー、ジャンプ、プロパティ補完 ✅
            withItems:                                     # ← 定義（ジャンプ先） ✅
              - {name: "foo", value: "bar"}
              - {name: "baz", value: "qux"}
```

### Helm構文 ✅

#### 9. values.yaml参照 ✅

```yaml
# values.yaml
namespace: argo
workflow:
  image:
    repository: alpine    # ← 定義（ジャンプ先）
    tag: latest
```

```yaml
# templates/workflow.yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  namespace: {{ .Values.namespace }}           # ← ジャンプ、ホバー、補完可能 ✅
spec:
  templates:
    - name: main
      container:
        image: {{ .Values.workflow.image.repository }}  # ← ネストされた値も対応 ✅
```

#### 10. Helmテンプレート関数 ✅

```yaml
# templates/_helpers.tpl
{{- define "mychart.name" -}}     # ← 定義（ジャンプ先）
{{ .Chart.Name }}
{{- end -}}

{{- define "mychart.labels" -}}   # ← 定義
app: {{ include "mychart.name" . }}
{{- end -}}
```

```yaml
# templates/workflow.yaml
metadata:
  name: {{ include "mychart.name" . }}      # ← ジャンプ、ホバー、補完可能 ✅
  labels:
    {{- include "mychart.labels" . | nindent 4 }}  # ← パイプ記法も対応 ✅
```

#### 11. Helmブロックハイライト ✅

```yaml
# カーソルを {{- if ... }} に置くと、対応する else / end がハイライトされる
{{- if .Values.enabled }}     # ← ハイライト
  ...
{{- else }}                   # ← ハイライト
  ...
{{- end }}                    # ← ハイライト

# range / with / define ブロックも対応
{{- range .Values.items }}    # ← ハイライト
  ...
{{- end }}                    # ← ハイライト
```

#### 12. ドキュメントアウトライン ✅

```yaml
# Ctrl+Shift+O でYAML構造のアウトラインを表示
# マルチドキュメントYAML（---区切り）にも対応
---
apiVersion: v1
kind: ConfigMap           # → "ConfigMap: my-config" としてアウトライン表示
metadata:
  name: my-config
---
apiVersion: v1
kind: Service             # → "Service: my-service" としてアウトライン表示
metadata:
  name: my-service
```

#### 13. エラー検出 ✅

```yaml
# 存在しない値への参照を検出
namespace: {{ .Values.nonExistent }}    # ← エラー: 値が存在しません ❌

# 存在しないテンプレート参照を検出
name: {{ include "missing.template" . }}  # ← エラー: テンプレートが存在しません ❌

# 存在しないパラメータ参照を検出
args: ["{{inputs.parameters.missing}}"]   # ← エラー: パラメータが存在しません ❌
```

### ConfigMap/Secret構文 ✅

#### 14. ConfigMap/Secret参照 ✅

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  database-url: postgres://localhost    # ← 定義（ジャンプ先） ✅

---
env:
  - name: DB_URL
    valueFrom:
      configMapKeyRef:
        name: my-config                 # ← ジャンプ、ホバー、補完 ✅
        key: database-url               # ← ジャンプ、ホバー、補完 ✅
  - name: SECRET_KEY
    valueFrom:
      secretKeyRef:
        name: my-secret                 # ← 同様にサポート ✅
        key: api-key                    # ← 値は [hidden] で隠蔽 ✅
```

---

## プロジェクト構造

```
helm-yaml-lsp/
├── packages/
│   ├── server/                      # Language Server (エディタ非依存)
│   │   ├── src/
│   │   │   ├── server.ts            # エントリポイント
│   │   │   ├── types/
│   │   │   │   └── argo.ts          # Argo型定義（LSP標準型）
│   │   │   ├── utils/
│   │   │   │   ├── uriUtils.ts      # URI処理
│   │   │   │   └── fileSystem.ts    # ファイル操作
│   │   │   ├── features/
│   │   │   │   ├── documentDetection.ts
│   │   │   │   ├── templateFeatures.ts
│   │   │   │   ├── parameterFeatures.ts
│   │   │   │   ├── stepFeatures.ts
│   │   │   │   ├── workflowVariables.ts
│   │   │   │   ├── itemVariableFeatures.ts
│   │   │   │   └── ...
│   │   │   ├── references/
│   │   │   │   ├── handler.ts           # ReferenceHandler型
│   │   │   │   ├── registry.ts          # ReferenceRegistry
│   │   │   │   ├── setup.ts             # ガード/ハンドラー登録
│   │   │   │   ├── types.ts             # 統一型定義
│   │   │   │   └── handlers/            # 各参照型のハンドラー
│   │   │   ├── services/
│   │   │   │   ├── fileWatcher.ts
│   │   │   │   ├── argoTemplateIndex.ts
│   │   │   │   ├── helmChartIndex.ts
│   │   │   │   ├── valuesIndex.ts
│   │   │   │   └── configMapIndex.ts
│   │   │   └── providers/
│   │   │       ├── definitionProvider.ts
│   │   │       ├── hoverProvider.ts
│   │   │       ├── completionProvider.ts
│   │   │       ├── diagnosticProvider.ts
│   │   │       ├── documentSymbolProvider.ts
│   │   │       └── documentHighlightProvider.ts
│   │   ├── test/                    # 596 tests
│   │   └── package.json
│   ├── vscode-client/               # VSCode拡張
│   │   └── src/extension.ts
│   └── nvim-client/                 # Neovim拡張
│       └── lua/argo-workflows-lsp/init.lua
├── samples/                         # テスト用サンプル
│   ├── argo/                        # Plain YAML版（11ファイル）
│   │   ├── workflow-basic.yaml
│   │   ├── workflow-templateref.yaml
│   │   ├── workflow-parameters.yaml
│   │   └── ...
│   └── helm/                        # Helm版
│       ├── Chart.yaml
│       └── templates/
├── vscode-kubernetes-tools-argo/    # 移行元（git submodule）
└── progress.md                      # 進捗記録
```

---

## セットアップ

### 前提条件

- **Node.js** 18以上
- **Bun** 1.0以上

### インストール

```bash
# リポジトリをクローン
git clone --recursive https://github.com/yourusername/helm-yaml-lsp.git
cd helm-yaml-lsp

# 依存関係をインストール
bun install

# ビルド
bun run build
```

### VSCodeで使用

```bash
# F5キーを押してExtension Development Hostを起動
# または
bun run package  # VSIXパッケージを作成
```

### Neovimで使用

```bash
# nvim-lspconfigをインストール済みの場合
cd packages/nvim-client
# init.luaに設定を追加（README参照）
```

---

## 開発

### ビルド & テスト

```bash
# 全パッケージをビルド
bun run build

# ウォッチモード（自動再コンパイル）
bun run watch

# テスト実行
bun run test                # 596 tests
```

### コード品質チェック

```bash
# 完全チェック（型チェック + Biome）
bun run check

# 型チェックのみ
bun run typecheck

# Lint & Format
bun run lint
bun run format

# 自動修正
bun run check:write
```

### デバッグ

**VSCode**:
1. `F5` キーを押す
2. 「Client + Server」を選択（推奨）
3. Extension Development Hostで `samples/argo/workflow-templateref.yaml` を開く
4. `F12`キーで定義ジャンプをテスト

**Neovim**:
```bash
nvim samples/argo/workflow-templateref.yaml
# templateRef参照の上で gd を押す
```

---

## 実装ロードマップ

### Phase 1: プロジェクト構造のセットアップ ✅

- モノレポ構造（bun workspaces）
- LSPサーバー基盤
- VSCode/Neovimクライアント
- ビルドシステム
- デバッグ環境

### Phase 2: コア機能の移植 ✅

- 型定義の移行（LSP標準型）
- URI処理（Node.js標準API）
- ファイルシステム操作（fast-glob）
- ファイル監視（LSP標準）
- YAMLパーサー層
- テンプレートインデックス
- **Definition Provider**

**テスト**: 116 tests passed
**動作確認**: VSCode ✅ | Neovim ✅

### Phase 3: Argo Workflows追加機能 ✅

実装完了（詳細は [PHASE3_PLAN.md](./PHASE3_PLAN.md)）:

1. **Hover Provider** - テンプレート、パラメータ、Workflow変数
2. **パラメータ機能** - inputs/outputs.parametersの定義と参照
3. **Workflow変数** - workflow.name等8つの組み込み変数
4. **Completion Provider** - テンプレート名、パラメータ名、変数の補完
5. **Diagnostic Provider** - 存在しないテンプレート/パラメータ参照の検出
6. **ローカルテンプレート参照** - 同一ファイル内のテンプレート

**テスト**: 173 tests passed
**動作確認**: VSCode ✅ | Neovim ✅

### Phase 4: Helm機能のサポート ✅

実装完了（詳細は [PHASE4_PLAN.md](./PHASE4_PLAN.md)）:

1. **Helm Chart検出** - Chart.yaml + values.yaml + templates/の自動検出
2. **values.yaml解析** - ネストされた値のフラット化とインデックス化
3. **.Values参照** - Definition/Hover/Completion/Diagnosticsの完全サポート
4. **include/template関数** - Helmテンプレート定義の検出とジャンプ
5. **統合テスト** - Helm + Argo Workflows統合テスト（14 tests）

**テスト**: 320 tests passed（+105 tests）
**動作確認**: VSCode ✅ | Neovim ✅
**サンプル**: `samples/helm/` - 実際のHelm Chart構造

### Phase 5: ConfigMap/Secretサポート ✅

実装完了（詳細は [PHASE5_PLAN.md](./PHASE5_PLAN.md)）:

1. **ConfigMap/Secret検出** - kind: ConfigMap/Secretの自動インデックス化
2. **参照パターン** - configMapKeyRef/secretKeyRef/configMapRef/secretRef/volume参照
3. **全LSP機能** - Definition/Hover/Completion/Diagnosticsの完全サポート

**テスト**: 440 tests passed（+120 tests）

### Phase 6: IntelliJ Pluginサポート 🔨

基本実装完了（詳細は [PHASE6_PLAN.md](./PHASE6_PLAN.md)）:

1. **IntelliJ Platform標準API** - LSP統合、外部依存ゼロ
2. **設定UI** - サーバーパス自動検出（5段階の優先順位）

### Phase 8: Artifact参照サポート ✅

実装完了（詳細は [PHASE8_PLAN.md](./PHASE8_PLAN.md)）:

1. **inputs/outputs.artifacts** - Definition/Hover/Completion/Diagnostics
2. **steps/tasks.outputs.artifacts** - クロステンプレート参照

### Phase 9: Script Result & Workflow Outputs ✅

実装完了（詳細は [PHASE9_PLAN.md](./PHASE9_PLAN.md)）:

1. **outputs.result** - スクリプトテンプレートの結果参照、言語検出
2. **workflow.outputs.parameters/artifacts** - トップレベルWorkflow出力

### Phase 10: Item変数サポート ✅

実装完了（詳細は [PHASE10_PLAN.md](./PHASE10_PLAN.md)）:

1. **`{{item}}`/`{{item.xxx}}`** - withItems/withParamソースへの定義ジャンプ
2. **プロパティ補完** - オブジェクト配列の場合にプロパティ名を補完

### Phase 11: Document Symbol & Highlight ✅

実装完了（詳細は [PHASE11_PLAN.md](./PHASE11_PLAN.md)）:

1. **Document Symbol Provider** - YAMLアウトライン表示、マルチドキュメント対応
2. **Document Highlight Provider** - Helmブロック構造の対応タグハイライト

**テスト**: 596 tests passed（Phase 5以降 +156 tests）

---

## スクリプト一覧

### ビルド

```bash
bun run build               # 全パッケージをビルド
bun run watch               # ウォッチモード
bun run clean               # ビルド成果物を削除
```

### コード品質

```bash
bun run check               # 型チェック + Biome
bun run typecheck           # 型チェックのみ
bun run lint                # Biome lint
bun run format              # Biome formatチェック
bun run check:write         # 自動修正
```

### テスト

```bash
bun run test                # 全テスト実行（596 tests）
bun run test:packages       # 各パッケージのテスト
bun run test:all            # 統合 + パッケージテスト
```

### パッケージング

```bash
bun run package             # VSIXパッケージ作成
```

---

## ドキュメント

- **[progress.md](./progress.md)** - 詳細な開発進捗記録
- **[CLAUDE.md](./CLAUDE.md)** - Claude Code向け開発ガイド
- **[PHASE1_PLAN.md](./PHASE1_PLAN.md)** - Phase 1詳細計画
- **[PHASE2_PLAN.md](./PHASE2_PLAN.md)** - Phase 2詳細計画
- **[PHASE3_PLAN.md](./PHASE3_PLAN.md)** - Phase 3詳細計画（Argo Workflows追加機能）
- **[PHASE4_PLAN.md](./PHASE4_PLAN.md)** - Phase 4詳細計画（Helm機能）
- **[PHASE5_PLAN.md](./PHASE5_PLAN.md)** - Phase 5詳細計画（ConfigMap/Secret）
- **[PHASE6_PLAN.md](./PHASE6_PLAN.md)** - Phase 6詳細計画（IntelliJ Plugin）
- **[PHASE8_PLAN.md](./PHASE8_PLAN.md)** - Phase 8詳細計画（Artifact参照）
- **[PHASE9_PLAN.md](./PHASE9_PLAN.md)** - Phase 9詳細計画（Script Result）
- **[PHASE10_PLAN.md](./PHASE10_PLAN.md)** - Phase 10詳細計画（Item変数）
- **[PHASE11_PLAN.md](./PHASE11_PLAN.md)** - Phase 11詳細計画（Symbol/Highlight）
- **[samples/README.md](./samples/README.md)** - サンプルファイルの説明

---

## 技術スタック

- **ツールチェイン**: Bun（パッケージマネージャ & バンドラ）
- **Linter/Formatter**: Biome
- **テストランナー**: Bun test
- **言語**: TypeScript（strict mode）
- **LSP**: vscode-languageserver（エディタ非依存）
- **ファイル検索**: fast-glob
- **Node.js標準APIのみ**: path, url, fs/promises

---

## 設定

### VSCode

VSCodeの設定（`settings.json`）で以下のオプションを設定できます：

```json
{
  // エラー診断の有効/無効（デフォルト: true）
  "argoWorkflowsLSP.enableDiagnostics": true,

  // ホバー情報の有効/無効（デフォルト: true）
  "argoWorkflowsLSP.enableHover": true,

  // 定義ジャンプの有効/無効（デフォルト: true）
  "argoWorkflowsLSP.enableDefinition": true,

  // 自動補完の有効/無効（デフォルト: true）
  "argoWorkflowsLSP.enableCompletion": true,

  // エラー数の上限（デフォルト: 1000）
  "argoWorkflowsLSP.maxNumberOfProblems": 1000
}
```

#### 診断機能（エラー検出）を無効にする

エラーの赤波線表示が不要な場合：

```json
{
  "argoWorkflowsLSP.enableDiagnostics": false
}
```

### Neovim

Neovimの設定（`init.lua`）で以下のように設定できます：

```lua
require('argo-workflows-lsp').setup({
  server_path = '/path/to/server.js',
  settings = {
    argoWorkflowsLSP = {
      maxNumberOfProblems = 1000,
      enableHover = true,
      enableDefinition = true,
      enableCompletion = true,
      enableDiagnostics = true,  -- エラー診断を無効にする場合はfalseに設定
    }
  }
})
```

---

## エディタ非依存性

このプロジェクトは**VSCode API依存ゼロ**を実現しています：

- ❌ `vscode.*` パッケージを一切使用しない
- ✅ LSP標準プロトコルのみに依存
- ✅ Node.js標準ライブラリのみ使用
- ✅ ESLintで静的解析
- ✅ VSCodeとNeovim両方で動作確認済み

---

## 貢献

プロジェクトへの貢献を歓迎します。

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

---

## ライセンス

MIT License

---

## 参考リンク

- [Argo Workflows](https://argoproj.github.io/argo-workflows/)
- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- [vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node)
- [Bun](https://bun.sh/)
- [Biome](https://biomejs.dev/)

---

**開発状況**: Phase 11完了 | 596 tests passed ✅
