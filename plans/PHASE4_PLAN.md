# Phase 4 実装計画: Helm機能のサポート

**最終更新**: 2026-01-27

## 概要

Phase 3までで基本的なArgo Workflows LSP機能が完成しました。Phase 4では、プロジェクトの主要目的である「Helm内に書かれたArgo Workflows YAML」のサポートを実装します。

**Phase 3完了時点での機能**:
- ✅ Definition Provider（定義へのジャンプ）
- ✅ Hover Provider（ホバー情報表示）
- ✅ Completion Provider（入力補完）
- ✅ Diagnostic Provider（エラー検出）
- ✅ パラメータ機能
- ✅ 173 tests passed

**Phase 4の目標**:
Helm Chart内での`.Values`参照、`include`/`template`関数、Helm組み込み関数のサポートを実装し、Helm templateファイルでの開発体験を大幅に向上させる。

---

## Phase 4.1: Helm Chart構造の検出とインデックス化

### 目的

Helm Chart構造を理解し、関連ファイル（Chart.yaml、values.yaml、templates/）を自動検出してインデックス化する。

### 実装内容

#### 4.1.1 Helm Chart検出

**ファイル**: `packages/server/src/features/helmChartDetection.ts`

**機能**:
- ワークスペース内のHelm Chartを検出
  - `Chart.yaml`の存在確認
  - `values.yaml`の存在確認
  - `templates/`ディレクトリの存在確認
- Chart構造の検証
- 複数のChartが存在する場合の対応

**型定義**:
```typescript
type HelmChart = {
  name: string;
  chartYamlUri: string;      // Chart.yamlのURI
  valuesYamlUri: string;     // values.yamlのURI
  templatesDir: string;      // templates/ディレクトリのパス
  rootDir: string;           // Chartのルートディレクトリ
};

type ChartMetadata = {
  name: string;
  version: string;
  description?: string;
  apiVersion: string;
};
```

#### 4.1.2 Helm Chartインデックス

**ファイル**: `packages/server/src/services/helmChartIndex.ts`

**機能**:
- 検出したChartをインデックス化
- Chart.yamlメタデータの解析
- ファイルとChartの関連付け
- ワークスペース変更時の自動更新

**主要メソッド**:
```typescript
class HelmChartIndex {
  initialize(workspaceFolders: string[]): Promise<void>
  findChartForFile(fileUri: string): HelmChart | undefined
  getAllCharts(): HelmChart[]
  updateChart(chartRootDir: string): Promise<void>
}
```

#### 4.1.3 実装タスク

- [ ] `isHelmChart(directory)`実装 - Chart.yaml存在確認
- [ ] `findHelmCharts(workspaceFolders)`実装 - Chart検出
- [ ] `parseChartYaml(content)`実装 - Chart.yaml解析
- [ ] `HelmChartIndex`クラス作成
- [ ] ファイル監視との統合（Chart.yaml変更検知）
- [ ] server.tsへの統合
- [ ] テスト作成（15+ tests）

#### 4.1.4 テスト内容

**テストファイル**: `packages/server/test/features/helmChartDetection.test.ts`

- Helm Chart検出（Chart.yaml + values.yaml + templates/）
- Chart.yamlメタデータ解析
- 複数Chart存在時の処理
- Chart以外のディレクトリの除外
- ネストされたChart構造の処理

**テストファイル**: `packages/server/test/services/helmChartIndex.test.ts`

- Chartインデックス初期化
- ファイルからChart検索
- Chart更新処理
- 存在しないChartの処理

---

## Phase 4.2: values.yaml解析とインデックス化

### 目的

values.yamlの構造を解析し、すべての値定義をインデックス化して、`.Values`参照をサポートする基盤を構築する。

### 実装内容

#### 4.2.1 values.yaml解析

**ファイル**: `packages/server/src/features/valuesYamlParser.ts`

**機能**:
- values.yamlのYAML解析
- ネストされた構造のフラット化（例: `foo.bar.baz`）
- 値の型推定（string, number, boolean, array, object）
- コメントの抽出（上行コメント、インラインコメント）
- デフォルト値の記録

**型定義**:
```typescript
type ValueDefinition = {
  path: string;              // 例: "replicaCount", "image.repository"
  value: unknown;            // 実際の値
  valueType: ValueType;      // 推定された型
  range: Range;              // values.yaml内の範囲
  uri: string;               // values.yamlのURI
  description?: string;      // コメントから抽出
  parentPath?: string;       // 親のパス（例: "image"）
};

type ValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'null'
  | 'unknown';
```

**実装例**:
```yaml
# values.yaml
# Number of replicas
replicaCount: 1

image:
  # Docker image repository
  repository: nginx
  tag: "1.16.0"
  pullPolicy: IfNotPresent
```

↓ インデックス化

```typescript
[
  { path: "replicaCount", value: 1, valueType: "number",
    description: "Number of replicas", ... },
  { path: "image.repository", value: "nginx", valueType: "string",
    description: "Docker image repository", ... },
  { path: "image.tag", value: "1.16.0", valueType: "string", ... },
  { path: "image.pullPolicy", value: "IfNotPresent", valueType: "string", ... }
]
```

#### 4.2.2 Valuesインデックス

**ファイル**: `packages/server/src/services/valuesIndex.ts`

**機能**:
- Chartごとのvalues定義を管理
- 値の検索（パスベース）
- 部分一致検索（補完用）
- values.yaml更新時の自動再インデックス

**主要メソッド**:
```typescript
class ValuesIndex {
  initialize(charts: HelmChart[]): Promise<void>
  indexValuesFile(valuesUri: string, chartName: string): Promise<void>
  findValue(chartName: string, valuePath: string): ValueDefinition | undefined
  findValuesByPrefix(chartName: string, prefix: string): ValueDefinition[]
  getAllValues(chartName: string): ValueDefinition[]
  updateValuesFile(valuesUri: string): Promise<void>
}
```

#### 4.2.3 実装タスク

- [ ] `parseValuesYaml(content, uri)`実装 - YAML解析
- [ ] `extractValueDefinitions(yamlNode, uri)`実装 - 値抽出
- [ ] ネストされたパスのフラット化ロジック
- [ ] 型推定ロジック
- [ ] コメント抽出ロジック
- [ ] `ValuesIndex`クラス作成
- [ ] ファイル監視との統合（values.yaml変更検知）
- [ ] テスト作成（25+ tests）

#### 4.2.4 テスト内容

**テストファイル**: `packages/server/test/features/valuesYamlParser.test.ts`

- シンプルな値の解析（string, number, boolean）
- ネストされたオブジェクトの解析
- 配列の解析
- コメント抽出（上行、インライン）
- 型推定の正確性
- 空のvalues.yaml処理
- 不正なYAMLのエラーハンドリング

**テストファイル**: `packages/server/test/services/valuesIndex.test.ts`

- Valuesインデックス初期化
- 値の検索（完全一致）
- 値の検索（プレフィックス）
- 複数Chart環境での検索
- values.yaml更新処理

---

## Phase 4.3: .Values参照のサポート

### 目的

Helmテンプレート内の`.Values`参照に対して、Definition/Hover/Completion/Diagnostics機能を提供する。

### 実装内容

#### 4.3.1 .Values参照の検出

**ファイル**: `packages/server/src/features/valuesReferenceFeatures.ts`

**機能**:
- `{{ .Values.xxx }}`パターンの検出
- `{{ .Values.foo.bar }}`のような階層構造の解析
- パイプライン内の参照検出（例: `{{ .Values.foo | quote }}`）
- 条件分岐内の参照検出（例: `{{ if .Values.enabled }}`）
- カーソル位置での参照抽出

**型定義**:
```typescript
type ValuesReference = {
  valuePath: string;         // 例: "image.repository"
  range: Range;              // テンプレート内の範囲
  fullExpression: string;    // 例: "{{ .Values.image.repository }}"
};
```

**検出パターン**:
```yaml
# 基本パターン
{{ .Values.replicaCount }}

# ネストされたパス
{{ .Values.image.repository }}

# パイプライン
{{ .Values.image.tag | default "latest" }}

# 条件分岐
{{ if .Values.ingress.enabled }}

# with構文
{{ with .Values.serviceAccount }}

# range構文
{{ range .Values.extraEnv }}
```

#### 4.3.2 Definition Provider統合

**ファイル**: `packages/server/src/providers/definitionProvider.ts`（拡張）

**機能**:
- `.Values`参照から`values.yaml`内の定義へジャンプ
- F12キー（VSCode）/ `gd`キー（Neovim）で動作

**実装例**:
```yaml
# templates/deployment.yaml
replicas: {{ .Values.replicaCount }}
           # ↑ F12でvalues.yamlの該当行へジャンプ
```

#### 4.3.3 Hover Provider統合

**ファイル**: `packages/server/src/providers/hoverProvider.ts`（拡張）

**機能**:
- `.Values`参照にホバー時、値とドキュメントを表示
- 値の型情報を表示
- デフォルト値を表示

**表示例**:
```markdown
**Value**: `image.repository`
**Type**: string
**Default**: `"nginx"`
**Chart**: my-chart

Docker image repository
```

#### 4.3.4 Completion Provider統合

**ファイル**: `packages/server/src/providers/completionProvider.ts`（拡張）

**機能**:
- `{{ .Values.|`で補完候補を表示
- ネストされたパスの補完（`{{ .Values.image.|`）
- 型情報をCompletionItemに含める

**表示例**:
```
{{ .Values.rep|
          ↓
- replicaCount (number)    # Number of replicas
```

```
{{ .Values.image.|
               ↓
- repository (string)      # Docker image repository
- tag (string)
- pullPolicy (string)
```

#### 4.3.5 Diagnostics統合

**ファイル**: `packages/server/src/providers/diagnosticProvider.ts`（拡張）

**機能**:
- 存在しない`.Values`参照を検出
- 型の不一致を警告（将来拡張）

**診断例**:
```yaml
{{ .Values.nonExistent }}
   # Error: Value 'nonExistent' not found in values.yaml
```

#### 4.3.6 実装タスク

- [ ] `findValuesReference(document, position)`実装
- [ ] `findAllValuesReferences(document)`実装
- [ ] Definition Providerに`.Values`参照処理を追加
- [ ] Hover Providerに`.Values`参照処理を追加
- [ ] Completion Providerに`.Values`補完を追加
- [ ] Diagnosticsに`.Values`検証を追加
- [ ] テスト作成（30+ tests）

#### 4.3.7 テスト内容

**テストファイル**: `packages/server/test/features/valuesReferenceFeatures.test.ts`

- 基本的な`.Values`参照検出
- ネストされたパス検出
- パイプライン内の参照検出
- 条件分岐内の参照検出
- カーソル位置での参照抽出

**プロバイダー統合テスト**: （既存テストファイルに追加）
- Definition: `.Values`参照から定義へジャンプ
- Hover: `.Values`参照のホバー情報表示
- Completion: `.Values`補完候補表示
- Diagnostics: 存在しない`.Values`参照の検出

---

## Phase 4.4: include/template関数のサポート

### 目的

Helmの`include`/`template`関数を解析し、テンプレート定義へのジャンプと補完を実装する。

### 実装内容

#### 4.4.1 テンプレート定義の検出

**ファイル**: `packages/server/src/features/helmTemplateFeatures.ts`

**機能**:
- `{{ define "name" }}`ブロックの検出
- `_helpers.tpl`ファイルの解析
- テンプレート名と範囲の抽出
- ネストされた`define`の処理

**型定義**:
```typescript
type HelmTemplateDefinition = {
  name: string;              // テンプレート名
  range: Range;              // defineブロックの範囲
  uri: string;               // ファイルURI
  content: string;           // テンプレート本体
  description?: string;      // コメントから抽出
  chartName: string;         // 所属するChart名
};
```

**検出例**:
```yaml
# templates/_helpers.tpl
{{/*
Generate full name
*/}}
{{ define "mychart.fullname" }}
{{ .Chart.Name }}-{{ .Release.Name }}
{{ end }}
```

#### 4.4.2 include/template参照の検出

**機能**:
- `{{ include "name" . }}`パターンの検出
- `{{ template "name" . }}`パターンの検出
- テンプレート名の抽出
- カーソル位置での参照検出

**型定義**:
```typescript
type HelmTemplateReference = {
  type: 'include' | 'template';
  templateName: string;
  range: Range;              // テンプレート名の範囲
  fullExpression: string;
};
```

**検出パターン**:
```yaml
# include関数
{{ include "mychart.fullname" . }}
{{ include "mychart.labels" . | indent 4 }}

# template関数
{{ template "mychart.name" . }}
```

#### 4.4.3 Helm Templateインデックス

**ファイル**: `packages/server/src/services/helmTemplateIndex.ts`

**機能**:
- Chartごとのテンプレート定義を管理
- `_helpers.tpl`および他のテンプレートファイルをインデックス化
- テンプレート名での検索
- ファイル更新時の自動再インデックス

**主要メソッド**:
```typescript
class HelmTemplateIndex {
  initialize(charts: HelmChart[]): Promise<void>
  indexTemplateFile(uri: string, chartName: string): Promise<void>
  findTemplate(chartName: string, templateName: string): HelmTemplateDefinition | undefined
  getAllTemplates(chartName: string): HelmTemplateDefinition[]
  updateTemplateFile(uri: string): Promise<void>
}
```

#### 4.4.4 プロバイダー統合

**Definition Provider**:
- `include`/`template`参照から`define`ブロックへジャンプ

**Hover Provider**:
- `include`/`template`参照にホバー時、テンプレート情報を表示

**Completion Provider**:
- `{{ include "|`で定義済みテンプレート名を補完
- `{{ template "|`で定義済みテンプレート名を補完

**Diagnostics**:
- 存在しないテンプレート参照を検出

#### 4.4.5 実装タスク

- [ ] `findDefineBlocks(document)`実装 - define検出
- [ ] `findTemplateReference(document, position)`実装
- [ ] `findAllTemplateReferences(document)`実装
- [ ] `HelmTemplateIndex`クラス作成
- [ ] Definition Providerに統合
- [ ] Hover Providerに統合
- [ ] Completion Providerに統合
- [ ] Diagnosticsに統合
- [ ] テスト作成（25+ tests）

#### 4.4.6 テスト内容

**テストファイル**: `packages/server/test/features/helmTemplateFeatures.test.ts`

- `{{ define }}`ブロック検出
- テンプレート名抽出
- ネストされた`define`処理
- `include`参照検出
- `template`参照検出
- コメント抽出

**テストファイル**: `packages/server/test/services/helmTemplateIndex.test.ts`

- インデックス初期化
- テンプレート検索
- 複数ファイル処理
- ファイル更新処理

**プロバイダー統合テスト**:
- Definition: `include`参照から`define`へジャンプ
- Hover: テンプレート情報表示
- Completion: テンプレート名補完
- Diagnostics: 存在しないテンプレート検出

---

## Phase 4.5: Helm組み込み関数のサポート

### 目的

Helmの組み込み関数（`toYaml`, `default`, `required`等）のホバー情報と補完を提供する。

### 実装内容

#### 4.5.1 Helm関数カタログ

**ファイル**: `packages/server/src/features/helmFunctions.ts`

**機能**:
- Helm組み込み関数のカタログ定義
- 各関数のシグネチャと説明
- 関数カテゴリ分類

**サポートする関数**:
```typescript
// 文字列関数
- quote, squote, cat, indent, nindent, trim, upper, lower, title, repeat

// 型変換関数
- toYaml, toJson, fromYaml, fromJson, toString, toDate

// デフォルト/必須
- default, required, empty, fail

// リスト関数
- list, first, last, append, prepend, slice, has, compact, uniq

// 辞書関数
- dict, get, set, unset, hasKey, pluck, merge, mergeOverwrite

// 条件関数
- ternary, and, or, not

// 演算関数
- add, sub, mul, div, mod, max, min

// その他
- b64enc, b64dec, sha256sum, uuidv4, date, now
```

**型定義**:
```typescript
type HelmFunction = {
  name: string;
  signature: string;         // 例: "default DEFAULT_VALUE GIVEN_VALUE"
  description: string;
  category: FunctionCategory;
  examples?: string[];
};

type FunctionCategory =
  | 'string'
  | 'conversion'
  | 'default'
  | 'list'
  | 'dict'
  | 'logic'
  | 'math'
  | 'encoding'
  | 'date'
  | 'other';
```

#### 4.5.2 関数参照の検出

**機能**:
- パイプライン内の関数検出
- 関数名の抽出
- カーソル位置での関数検出

**検出パターン**:
```yaml
{{ .Values.image.tag | default "latest" }}
{{ .Values.data | toYaml | indent 2 }}
{{ required "image.repository is required" .Values.image.repository }}
```

#### 4.5.3 プロバイダー統合

**Hover Provider**:
- 関数名にホバー時、シグネチャと説明を表示

**Completion Provider**:
- パイプライン（`|`）後に関数名を補完

**表示例**:
```markdown
**Function**: `default`
**Signature**: `default DEFAULT_VALUE GIVEN_VALUE`

Returns the default value if the given value is empty.

**Example**:
\`\`\`
{{ .Values.image.tag | default "latest" }}
\`\`\`
```

#### 4.5.4 実装タスク

- [ ] Helm関数カタログ作成（全主要関数）
- [ ] `findFunctionReference(document, position)`実装
- [ ] Hover Providerに関数情報を統合
- [ ] Completion Providerに関数補完を追加
- [ ] テスト作成（15+ tests）

#### 4.5.5 テスト内容

**テストファイル**: `packages/server/test/features/helmFunctions.test.ts`

- 関数カタログの完全性
- 関数検索
- カテゴリ分類
- 関数参照検出（パイプライン内）

**プロバイダー統合テスト**:
- Hover: 関数情報表示
- Completion: 関数名補完（パイプライン後）

---

## Phase 4.6: Chart.yamlサポート

### 目的

`.Chart`変数（`.Chart.Name`, `.Chart.Version`等）のサポートを実装する。

### 実装内容

#### 4.6.1 Chart変数の定義

**ファイル**: `packages/server/src/features/chartVariables.ts`

**サポートする変数**:
```typescript
// Chart.yamlから取得
.Chart.Name          // Chart名
.Chart.Version       // Chartバージョン
.Chart.Description   // 説明
.Chart.ApiVersion    // APIバージョン
.Chart.AppVersion    // アプリケーションバージョン
.Chart.Type          // Chartタイプ（application/library）
```

#### 4.6.2 Chart参照の検出

**機能**:
- `{{ .Chart.xxx }}`パターンの検出
- カーソル位置での参照抽出

#### 4.6.3 プロバイダー統合

**Definition Provider**:
- `.Chart.Name`等から`Chart.yaml`へジャンプ

**Hover Provider**:
- `.Chart`変数にホバー時、実際の値を表示

**Completion Provider**:
- `{{ .Chart.|`で利用可能なフィールドを補完

#### 4.6.4 実装タスク

- [ ] Chart変数の定義
- [ ] `findChartReference(document, position)`実装
- [ ] Definition Providerに統合
- [ ] Hover Providerに統合
- [ ] Completion Providerに統合
- [ ] テスト作成（10+ tests）

---

## Phase 4.7: Release/Capabilities変数のサポート（オプショナル）

### 目的

`.Release`および`.Capabilities`変数のサポートを追加する。

### 実装内容

#### 4.7.1 Release変数

**サポートする変数**:
```typescript
.Release.Name         // リリース名
.Release.Namespace    // 名前空間
.Release.Service      // リリースサービス（Helm）
.Release.IsUpgrade    // アップグレードか
.Release.IsInstall    // 新規インストールか
.Release.Revision     // リビジョン番号
```

#### 4.7.2 Capabilities変数

**サポートする変数**:
```typescript
.Capabilities.KubeVersion          // Kubernetesバージョン
.Capabilities.APIVersions          // 利用可能なAPIバージョン
.Capabilities.HelmVersion          // Helmバージョン
```

#### 4.7.3 プロバイダー統合

**Hover Provider**:
- 各変数の説明を表示

**Completion Provider**:
- `{{ .Release.|`で補完
- `{{ .Capabilities.|`で補完

#### 4.7.4 実装タスク

- [ ] Release変数の定義
- [ ] Capabilities変数の定義
- [ ] Hover Providerに統合
- [ ] Completion Providerに統合
- [ ] テスト作成（10+ tests）

---

## Phase 4.8: values.schema.jsonサポート（将来拡張）

### 目的

values.schema.jsonを使用した値の型検証と補完を実装する。

### 実装内容

#### 4.8.1 スキーマ解析

**機能**:
- values.schema.json（JSON Schema）の解析
- 型情報の抽出
- 必須フィールドの取得
- デフォルト値の取得

#### 4.8.2 スキーマベース検証

**機能**:
- values.yamlがスキーマに準拠しているか検証
- 型エラーの検出
- 必須フィールドの欠落検出

#### 4.8.3 実装タスク（将来拡張）

- [ ] JSON Schemaパーサー統合
- [ ] スキーマベース型検証
- [ ] Diagnosticsに統合
- [ ] テスト作成（15+ tests）

**判断**: Phase 4の主要機能ではないため、将来の拡張として位置づけ。

---

## 実装順序の推奨

Phase 4の各サブフェーズは以下の順序で実装することを推奨します：

1. **Phase 4.1: Helm Chart構造の検出** ← 基盤（必須）
2. **Phase 4.2: values.yaml解析** ← 中核機能（必須）
3. **Phase 4.3: .Values参照** ← 最重要機能（必須）
4. **Phase 4.4: include/template関数** ← 重要機能（推奨）
5. **Phase 4.6: Chart.yamlサポート** ← 補助機能（推奨）
6. **Phase 4.5: Helm組み込み関数** ← 補助機能（推奨）
7. **Phase 4.7: Release/Capabilities変数** ← オプション
8. **Phase 4.8: values.schema.json** ← 将来拡張

---

## Phase 4完了基準

以下がすべて満たされた時点で Phase 4 完了とする：

- [ ] Helm Chart構造が自動検出される
- [ ] values.yamlが解析されインデックス化される
- [ ] `.Values`参照が動作する（Definition/Hover/Completion/Diagnostics）
- [ ] `include`/`template`関数が動作する（Definition/Hover/Completion）
- [ ] `.Chart`変数が動作する（Hover/Completion）
- [ ] Helm組み込み関数のホバー情報が表示される
- [ ] 全テストが通過する（300+ tests想定）
- [ ] ビルドが成功する
- [ ] VSCodeとNeovim両方で動作確認できる
- [ ] サンプルHelmファイルで全機能が動作確認できる

---

## サンプルファイル作成

Phase 4の動作確認用にサンプルHelm Chartを作成する必要があります。

### 推奨構造

```
samples/helm/
├── Chart.yaml
├── values.yaml
├── values.schema.json (オプション)
└── templates/
    ├── _helpers.tpl
    ├── deployment.yaml
    ├── service.yaml
    ├── workflow.yaml          # Argo Workflowテンプレート
    └── workflowtemplate.yaml  # Argo WorkflowTemplate
```

### サンプル内容

**Chart.yaml**:
```yaml
apiVersion: v2
name: argo-workflows-demo
version: 1.0.0
description: Demo Helm Chart for Argo Workflows LSP
type: application
appVersion: "3.5.0"
```

**values.yaml**:
```yaml
# Workflow configuration
workflow:
  # Number of replicas
  replicaCount: 1

  # Container image
  image:
    repository: argoproj/argocli
    tag: "v3.5.0"
    pullPolicy: IfNotPresent

  # Argo Workflows parameters
  parameters:
    message: "Hello from Helm!"
    timeout: "5m"

# Service account
serviceAccount:
  create: true
  name: "argo-workflow"
```

**templates/_helpers.tpl**:
```yaml
{{/*
Generate full name
*/}}
{{ define "argo-workflows-demo.fullname" }}
{{ .Chart.Name }}-{{ .Release.Name }}
{{ end }}

{{/*
Generate labels
*/}}
{{ define "argo-workflows-demo.labels" }}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/version: {{ .Chart.Version }}
{{ end }}
```

**templates/workflow.yaml**:
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: {{ include "argo-workflows-demo.fullname" . }}
  labels:
    {{- include "argo-workflows-demo.labels" . | nindent 4 }}
spec:
  entrypoint: main
  arguments:
    parameters:
      - name: message
        value: {{ .Values.workflow.parameters.message | quote }}

  templates:
    - name: main
      container:
        image: {{ .Values.workflow.image.repository }}:{{ .Values.workflow.image.tag }}
        command: [echo]
        args: ["{{`{{inputs.parameters.message}}`}}"]
      inputs:
        parameters:
          - name: message
```

---

## 技術的な考慮事項

### パフォーマンス

- values.yamlの解析はキャッシュする
- 大きなvalues.yamlでも高速に動作させる
- インデックス更新は差分のみ処理

### エディタ非依存性

- すべての機能でVSCode API依存を避ける
- LSP標準プロトコルのみを使用
- Node.js標準ライブラリを優先
- `js-yaml`パッケージを使用（既存依存）

### Helm構文の複雑性

- Go templateの完全な構文解析は困難
- 実用的なパターンに焦点を当てる
- 正規表現ベースの検出から開始
- 必要に応じてパーサーを拡張

### マルチChart環境

- 同一ワークスペース内に複数のChartが存在する可能性
- ファイルが属するChartを正確に判定
- Chartごとに独立したインデックスを管理

### テストカバレッジ

- 各機能で包括的なテストを作成
- エッジケース（空ファイル、不正なYAML等）を考慮
- Phase 4終了時点で300テスト以上を目標

---

## 次のフェーズへ

Phase 4完了後は以下を検討：

- **Phase 5**: 高度な機能
  - リファクタリング（リネーム）
  - コードアクション
  - ドキュメントシンボル
  - ワークスペースシンボル検索

- **Phase 6**: パフォーマンス最適化とリリース準備
  - プロファイリング
  - 最適化
  - ドキュメント整備
  - デモ動画作成
  - VSCode Marketplace公開

---

## リスクと対応

### リスク1: Go template構文の複雑性

**リスク**: Helmの完全なGo template構文解析は非常に複雑。

**対応**:
- 実用的な主要パターンに焦点を当てる
- 完全な構文解析ではなく、パターンマッチングで対応
- 段階的に対応パターンを拡張

### リスク2: パフォーマンス

**リスク**: 大規模なvalues.yamlやテンプレートファイルで動作が遅くなる可能性。

**対応**:
- キャッシュ戦略を徹底
- 非同期処理の活用
- 差分更新の実装
- 必要に応じてインデックス構造を最適化

### リスク3: マルチChart環境

**リスク**: 複数のChartが存在する環境で、誤ったChartの値を参照する可能性。

**対応**:
- ファイルパスからChart所属を厳密に判定
- Chart境界を明確に管理
- テストでマルチChart環境を検証

---

## 成功指標

Phase 4が成功したと判断する指標：

1. **機能の完全性**
   - `.Values`参照の全機能動作（Definition/Hover/Completion/Diagnostics）
   - `include`/`template`関数の動作
   - Helm組み込み関数のサポート

2. **品質**
   - 300+ tests passed
   - ビルド成功
   - エディタ非依存性維持（ESLint通過）

3. **実用性**
   - サンプルHelm Chartで全機能動作
   - VSCodeとNeovim両方で動作確認
   - 実際のHelm Chartプロジェクトで使用可能

4. **ドキュメント**
   - CLAUDE.md更新
   - progress.md更新
   - サンプルファイルのREADME作成

---

## まとめ

Phase 4では、プロジェクトの主要目的である「Helm内に書かれたArgo Workflows YAML」のサポートを完全に実装します。

**Phase 4完了後のプロジェクト状態**:
- ✅ Argo Workflows LSP機能（Phase 2-3）
- ✅ Helm機能のフルサポート（Phase 4）
- ✅ エディタ非依存（VSCode/Neovim）
- ✅ 300+ tests
- ✅ 実用レベルの言語サーバー

このフェーズの成功により、Helm Chart開発者は`.Values`参照やテンプレート関数の補完・ジャンプを活用でき、開発体験が大幅に向上します。
