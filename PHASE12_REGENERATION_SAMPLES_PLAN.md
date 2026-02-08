# サンプルディレクトリ全面刷新

## 目的

LSPの全機能を網羅するサンプルYAMLを新規作成する。
サンプルは **機能カタログ**（ユーザー向けデモ）と **統合テストのフィクスチャ** を兼ねる。

## 原則

1. **コメントは日本語** — ファイル先頭に「確認できること」、該当箇所付近に「操作方法と期待動作」
2. **フィクスチャ不変** — テスト失敗時はLSPコードを修正する（サンプルを改変しない）　が原則だが、今回はサンプルを再作成するミッションであるためサンプルが argo workflow の仕様に沿っていなければサンプルを直す
3. **統合テストは書き直す** — 新しいサンプルに合わせてテストを新規作成する
4. **構文を網羅** — LSPがサポートする全10参照タイプ × 全6プロバイダーをカバー
5. **Argo仕様準拠** — サンプルは実際のArgo Workflowsクラスタでも動作可能な正しいマニフェストであること（意図的エラーファイルを除く）

## ディレクトリ構成

```
samples/
├── CLAUDE.md                  # フィクスチャポリシー（既存）
├── README.md                  # ファイル一覧・使い方（更新）
├── argo/                      # Plain YAML版
│   ├── workflow-basic.yaml
│   ├── workflow-templateref.yaml
│   ├── workflow-dag.yaml
│   ├── workflow-parameters.yaml
│   ├── workflow-artifacts.yaml
│   ├── workflow-result.yaml
│   ├── workflow-variables.yaml
│   ├── workflow-item.yaml
│   ├── workflow-configmap.yaml
│   ├── workflow-template.yaml
│   ├── cluster-workflow-template.yaml
│   ├── cron-workflow.yaml
│   ├── configmap-data.yaml
│   ├── demo-workflow.yaml
│   ├── demo-workflow-invalid.yaml
│   └── workflow.yaml              # エラー検出テスト用
└── helm/                      # Helm Chart版
    ├── Chart.yaml
    ├── values.yaml
    └── templates/
        ├── _helpers.tpl
        ├── workflow.yaml          # Helm統合テスト基盤
        ├── workflow-basic.yaml
        ├── workflow-templateref.yaml
        ├── workflow-dag.yaml
        ├── workflow-parameters.yaml
        ├── workflow-artifacts.yaml
        ├── workflow-result.yaml
        ├── workflow-variables.yaml
        ├── workflow-item.yaml
        ├── workflow-template.yaml
        ├── cron-workflow.yaml
        └── configmap-helm.yaml
```

---

## Phase 1: samples/argo/ — Plain YAML版

### コメント規約

```yaml
# =============================================================================
# workflow-xxx.yaml — ○○の動作確認
# =============================================================================
#
# 確認できること:
#   - （箇条書き）
#
# テスト分類: Self-contained / Cluster（依存ファイル: xxx.yaml）
# =============================================================================

# --- ここにカーソルを置いて F12 → ○○にジャンプ ---
template: hello-world
```

### 1-1. 基本構文（テンプレート参照）

#### workflow-basic.yaml — ローカルテンプレート参照

- **確認できること**: `template: xxx` でローカルテンプレート定義にジャンプ
- **テスト分類**: Self-contained
- **内容**:
  - `kind: Workflow` + `entrypoint` + `templates[]`
  - steps構造で順次実行（2ステップ以上）
  - 各 `template:` 参照が同ファイル内のテンプレート定義にジャンプできること
  - container定義（image, command, args）

#### workflow-template.yaml — WorkflowTemplate定義

- **確認できること**: 再利用可能テンプレートの定義（他ファイルからの参照先）
- **テスト分類**: 他ファイルの依存先
- **内容**:
  - `kind: WorkflowTemplate`
  - 3つ以上のテンプレート定義（hello, goodbye, whalesay-template 等）
  - inputs.parameters を持つテンプレートを1つ以上含む

#### cluster-workflow-template.yaml — ClusterWorkflowTemplate定義

- **確認できること**: クラスタスコープのテンプレート定義
- **テスト分類**: 他ファイルの依存先
- **内容**:
  - `kind: ClusterWorkflowTemplate`
  - 2つ以上のテンプレート定義（cluster-hello, cluster-job 等）

#### workflow-templateref.yaml — templateRef参照

- **確認できること**: `templateRef` で別ファイルのWorkflowTemplate/ClusterWorkflowTemplateにジャンプ
- **テスト分類**: Cluster（依存: workflow-template.yaml, cluster-workflow-template.yaml）
- **内容**:
  - WorkflowTemplate参照: `templateRef: { name: xxx, template: yyy }`
  - ClusterWorkflowTemplate参照: `templateRef: { name: xxx, template: yyy, clusterScope: true }`

#### workflow-dag.yaml — DAG構造

- **確認できること**: DAGの `tasks` 参照、依存関係、templateRef
- **テスト分類**: Cluster（依存: workflow-template.yaml）
- **内容**:
  - `dag.tasks[]` で並列実行と `dependencies: [...]` で依存関係指定
  - ローカルテンプレート参照 + templateRef参照を混在

### 1-2. データフロー

#### workflow-parameters.yaml — パラメータ参照

- **確認できること**: inputs/outputs.parameters の定義・参照・ジャンプ
- **テスト分類**: Self-contained
- **内容**:
  - `inputs.parameters` 定義（name, default, description）
  - `outputs.parameters` 定義（valueFrom.path）
  - Steps内での `{{steps.xxx.outputs.parameters.yyy}}` 参照
  - DAG内での `{{tasks.xxx.outputs.parameters.yyy}}` 参照
  - `{{inputs.parameters.xxx}}` の展開
  - 各種クオートパターン（ダブル・シングル・なし）

#### workflow-artifacts.yaml — アーティファクト参照

- **確認できること**: inputs/outputs.artifacts のジャンプ・ホバー
- **テスト分類**: Self-contained（multi-doc）
- **内容**:
  - WorkflowTemplate定義（generate, process テンプレート）
  - `inputs.artifacts` 定義（name, path）
  - `outputs.artifacts` 定義（name, path）
  - `{{steps.generate.outputs.artifacts.output-file}}` 参照
  - `{{inputs.artifacts.input-file}}` 参照
  - `{{outputs.artifacts.output-file}}` 参照

#### workflow-result.yaml — Script Result参照

- **確認できること**: `outputs.result` のジャンプ・ホバー（言語検出）
- **テスト分類**: Self-contained（multi-doc）
- **内容**:
  - Steps構造: script テンプレートを呼び出し → `{{steps.run-script.outputs.result}}`
  - DAG構造: script テンプレートを呼び出し → `{{tasks.task-script.outputs.result}}`
  - script定義（image, command, source）— Python/Bash等

### 1-3. 変数

#### workflow-variables.yaml — Workflow変数

- **確認できること**: `{{workflow.*}}` 変数のホバー・定義ジャンプ
- **テスト分類**: Self-contained（multi-doc: Workflow + CronWorkflow）
- **内容**:
  - `metadata.labels` / `metadata.annotations` — `workflow.labels/annotations` のジャンプ先
  - `spec.arguments.parameters` — `workflow.parameters` のジャンプ先（message, count, environment）
  - 基本変数: `workflow.name`, `workflow.namespace`, `workflow.uid`, `workflow.serviceAccountName`, `workflow.duration`, `workflow.priority`, `workflow.mainEntrypoint`
  - Timestamp: `workflow.creationTimestamp` + サブフォーマット（`.RFC3339`, `.Y`, `.m`, `.d`）
  - workflow.parameters: `.message`, `.count`, `.environment`
  - Labels/Annotations: `workflow.labels.app`, `workflow.annotations.description`
  - Exit handler: `workflow.status`
  - CronWorkflow（別ドキュメント）: `workflow.scheduledTime`, `workflow.creationTimestamp`

#### workflow-item.yaml — Item変数

- **確認できること**: `{{item}}`, `{{item.xxx}}` のホバー・定義ジャンプ
- **テスト分類**: Self-contained（multi-doc）
- **内容**:
  - `withItems` スカラー配列: `{{item}}` 参照
  - `withItems` オブジェクト配列: `{{item.name}}`, `{{item.value}}` 参照
  - `withParam` 参照（workflow.parameters, steps.outputs.parameters）
  - DAGでの withItems
  - 数値配列

### 1-4. ConfigMap/Secret

#### configmap-data.yaml — ConfigMap/Secret定義

- **確認できること**: ConfigMap/Secretリソースの定義（他ファイルからの参照先）
- **テスト分類**: 他ファイルの依存先
- **内容**:
  - `kind: ConfigMap`（name: `app-config`）+ data キー群
  - `kind: Secret`（name: `app-secrets`）+ data キー群（base64エンコード）

#### workflow-configmap.yaml — ConfigMap/Secret参照

- **確認できること**: configMapKeyRef/secretKeyRef/envFrom/volume参照のジャンプ・ホバー
- **テスト分類**: Cluster（依存: configmap-data.yaml）
- **内容**:
  - `valueFrom.configMapKeyRef: { name: app-config, key: xxx }`
  - `valueFrom.secretKeyRef: { name: app-secrets, key: xxx }`
  - `envFrom.configMapRef: { name: app-config }`
  - `envFrom.secretRef: { name: app-secrets }`
  - `volumes[].configMap: { name: app-config }`
  - `volumes[].secret: { secretName: app-secrets }`

### 1-5. リソース種別

#### cron-workflow.yaml — CronWorkflow定義

- **確認できること**: CronWorkflow固有の構文（schedule, concurrencyPolicy）
- **テスト分類**: Cluster（依存: workflow-template.yaml）
- **内容**:
  - `kind: CronWorkflow` + `spec.schedule` + `spec.concurrencyPolicy`
  - `workflowSpec` 内での templateRef 参照

### 1-6. 統合・エラー検出

#### demo-workflow.yaml — 全機能統合デモ

- **確認できること**: Phase 2〜10 の全機能を1ファイルで段階的に確認
- **テスト分類**: Self-contained（multi-doc: ConfigMap + Secret + WorkflowTemplate + Workflow）
- **内容**:
  - Section 1: ConfigMap `app-config`（5キー）+ Secret `app-secrets`（3キー）
  - Section 2: WorkflowTemplate `demo-templates`
  - Section 3: メインワークフロー
    - パラメータ / templateRef / ConfigMap参照 / Artifact / Result / Item変数

#### demo-workflow-invalid.yaml — 意図的エラー集

- **確認できること**: LSP診断機能のエラー検出
- **テスト分類**: Self-contained
- **内容（各エラーを必ず含むこと）**:
  - `non-existent-template`: 存在しないローカルテンプレート参照
  - `missing-template`: templateRef内の存在しないテンプレート
  - `missing-configmap`: 存在しないConfigMap参照（env + volume で2箇所以上）
  - `missing-secret`: 存在しないSecret参照（env + volume で2箇所以上）
  - `invalid.key`: ConfigMap `valid-config`（定義あり）内の存在しないキー

#### workflow.yaml — テンプレートエラー検出

- **確認できること**: 存在しないテンプレート参照の診断
- **テスト分類**: Self-contained
- **内容**: `template: test-template` を含む（test-template は未定義）

---

## Phase 2: samples/helm/ — Helm Chart版

### 必須設定ファイル

#### Chart.yaml

```yaml
apiVersion: v2
name: argo-workflow-sample
version: 0.1.0
appVersion: "1.0.0"
```

#### values.yaml

- `namespace: argo`
- `workflow.image.repository: alpine`
- `workflow.image.tag: latest`
- `workflow.enabled: true`
- `workflow.schedule: "0 * * * *"`
- `workflow.concurrencyPolicy: Replace`
- `workflowTemplate.enabled: true`
- その他: テンプレートファイルで参照する全キーを含む

#### templates/_helpers.tpl

- `define "argo-workflow-sample.name"` — Chart名
- `define "argo-workflow-sample.fullname"` — Release名含むフルネーム（コメントで説明あり）
- `define "argo-workflow-sample.labels"` — 共通ラベル
- `.Chart.Name`, `.Chart.Version`, `.Release.Name`, `.Release.Service` を使用

### テンプレートファイル

#### templates/workflow.yaml — Helm統合テスト基盤

- `.Values.namespace` 参照（Definition/Hover/Completion テストの対象）
- `{{ include "argo-workflow-sample.name" . }}` 参照
- Argo Workflow構文（`kind: Workflow`）

#### 他テンプレートファイル（workflow-basic.yaml 等）

argo/ 版と同じArgo構文を持ちつつ、以下のHelm機能を追加:
- `{{ .Values.xxx }}` による値参照
- `{{ include "argo-workflow-sample.xxx" . }}` によるヘルパー呼び出し
- `{{- if .Values.xxx.enabled }}` による条件分岐
- Argoパラメータのエスケープ: `` {{` `{{inputs.parameters.xxx}}` `}} ``

#### templates/configmap-helm.yaml — Helm専用機能テスト

- `{{ include "xxx" . }}` のジャンプ確認
- `{{ template "xxx" . }}` のジャンプ確認
- `.Release.Name`, `.Release.Namespace`, `.Release.Service`, `.Release.Revision` のホバー確認
- `.Chart.Name`, `.Chart.Version` のホバー確認
- Helm組み込み関数（`| quote`, `| nindent`, `| b64enc` 等）のホバー確認

---

## Phase 3: 統合テスト新規作成

既存の統合テスト（sample-fixtures.test.ts, helm-argo.test.ts）を削除し、新しいサンプルに合わせて書き直す。

### sample-fixtures.test.ts

| テストクラスタ | ファイル | 検証内容 |
|--------------|--------|---------|
| Self-contained | workflow-basic.yaml | 診断 0件 |
| TemplateRef | workflow-template + cluster-wt + workflow-templateref | 診断 0件 |
| ConfigMap | configmap-data + workflow-configmap | 診断 0件、ConfigMap/Secret 検出 |
| DAG | workflow-template + workflow-dag | 診断 0件 |
| CronWorkflow | workflow-template + cron-workflow | 診断 0件 |
| Demo | demo-workflow.yaml | CM 5キー、Secret 3キー、WT検出、診断 0件 |
| Error | workflow.yaml | test-template エラー 1件以上 |
| Error | demo-workflow-invalid.yaml | 7件以上エラー（各種エラータイプを個別検証） |
| Artifacts | workflow-artifacts.yaml | 診断 0件 |
| Result | workflow-result.yaml | 診断 0件 |
| Item | workflow-item.yaml | 診断 0件 |

追加: 各機能ファイルごとの Hover/Definition テスト
- workflow-variables.yaml: workflow変数のhover/definition
- workflow-artifacts.yaml: artifact参照のhover/definition
- workflow-result.yaml: result参照のhover/definition
- workflow-item.yaml: item変数のhover

### helm-argo.test.ts

- Chart検出（`argo-workflow-sample`）
- values.yaml解析（namespace, workflow.image.repository）
- `.Values` Definition/Hover/Completion/Diagnostics
- `include`/`template` Definition/Hover
- `_helpers.tpl` テンプレート検出（3つ + description あり）
- Helm + Argo 同一ファイルでの動作

---

## Phase 4: Argo Workflows 仕様準拠の検証

サンプルファイルが Argo Workflows の公式仕様に沿っているかを以下の方法で検証する。

### 4-1. argo lint（公式CLI）— 一次検証

```bash
# インストール（未導入の場合）
brew install argo

# Plain YAML版の検証（オフラインモード: クラスタ不要）
argo lint --offline samples/argo/workflow-basic.yaml
argo lint --offline samples/argo/workflow-template.yaml
# ... 各ファイル

# ディレクトリ一括検証
argo lint --offline samples/argo/

# 特定リソース種別のみ
argo lint --offline --kinds=workflows samples/argo/
argo lint --offline --kinds=workflowtemplates samples/argo/
argo lint --offline --kinds=cronworkflows samples/argo/
argo lint --offline --kinds=clusterworkflowtemplates samples/argo/

# strict モード（デフォルト有効）で参照整合性も検証
# templateRef の解決には関連ファイルを一括指定する
argo lint --offline --strict \
  samples/argo/workflow-templateref.yaml \
  samples/argo/workflow-template.yaml \
  samples/argo/cluster-workflow-template.yaml
```

**注意**: `demo-workflow-invalid.yaml` と `workflow.yaml` は意図的にエラーを含むため、lint失敗が期待値。

### 4-2. JSON Schema 検証 — 構造的バリデーション

Argo Workflows公式のJSON Schemaを使ってYAML構造を検証する。

```bash
# スキーマ取得
curl -o /tmp/argo-schema.json \
  https://raw.githubusercontent.com/argoproj/argo-workflows/main/api/jsonschema/schema.json

# スキーマ検証（例: ajv-cli, check-jsonschema 等）
check-jsonschema --schemafile /tmp/argo-schema.json samples/argo/workflow-basic.yaml
```

VSCodeの場合、Red Hat YAML拡張で以下を `.vscode/settings.json` に設定すれば編集中にリアルタイム検証できる:

```json
{
  "yaml.schemas": {
    "https://raw.githubusercontent.com/argoproj/argo-workflows/main/api/jsonschema/schema.json": "samples/argo/*.yaml"
  }
}
```

### 4-3. helm template + argo lint — Helm版の検証

Helmテンプレートはそのままでは検証できないため、レンダリング後に検証する。

```bash
# Helm レンダリング → Argo lint パイプライン
helm template my-release samples/helm/ | argo lint --offline -

# 特定テンプレートのみ
helm template my-release samples/helm/ --show-only templates/workflow-basic.yaml \
  | argo lint --offline -
```

### 4-4. 検証チェックリスト

各サンプルファイルで以下を確認する:

| チェック項目 | 対象 | 方法 |
|-------------|------|------|
| apiVersion が `argoproj.io/v1alpha1` | Argo リソース | argo lint / 目視 |
| kind が正しい | 全ファイル | argo lint |
| 必須フィールド（metadata.name, spec.entrypoint, spec.templates） | Workflow | argo lint --strict |
| container と script が同一テンプレートに共存しない | テンプレート定義 | argo lint --strict |
| steps と dag が同一テンプレートに共存しない | テンプレート定義 | argo lint --strict |
| templateRef.name が実在する | Cluster テスト | argo lint --offline（関連ファイル一括） |
| パラメータ名の一貫性（定義と参照の一致） | パラメータ系 | argo lint --strict + LSP診断 |
| CronWorkflow の schedule が有効なcron式 | cron-workflow | argo lint |
| ConfigMap/Secret は標準K8sリソース | configmap-data | kubectl --dry-run=client |

### 4-5. CI/自動化（オプション）

npm script として検証を自動化できる:

```json
{
  "scripts": {
    "validate:argo": "argo lint --offline samples/argo/",
    "validate:helm": "helm template test samples/helm/ | argo lint --offline -"
  }
}
```

---

## Phase 5: 仕上げ

1. **README.md 更新** — 実際のファイル一覧・使い方に合わせる
2. **全テスト実行** — `bun run test` で全パス確認
3. **Biome** — `bun run check:write` で自動修正

---

## 実行順序

1. argo/ ファイル作成（基本構文 → データフロー → 変数 → ConfigMap → リソース → 統合）
2. **argo lint --offline で各ファイルを検証**（仕様違反があれば即修正）
3. helm/ 設定ファイル作成（Chart.yaml → values.yaml → _helpers.tpl）
4. helm/templates/ ファイル作成（argo/ を元にHelm構文を追加）
5. **helm template + argo lint で Helm版を検証**
6. 統合テスト新規作成（sample-fixtures.test.ts → helm-argo.test.ts）
7. README.md 更新
8. 全テスト実行・Biome修正
