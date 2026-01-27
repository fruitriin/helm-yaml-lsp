# Argo Workflows サンプルファイル

このディレクトリには、VSCode Kubernetes Tools拡張機能のArgo Workflows統合機能をテストするためのサンプルファイルが含まれています。

## ディレクトリ構成

```
samples/
├── argo/               # Plain YAML版のサンプル
│   ├── workflow-*.yaml # 機能別Workflowファイル
│   ├── workflow-template.yaml
│   ├── cluster-workflow-template.yaml
│   └── cron-workflow.yaml
└── helm/               # Helm版のサンプル
    ├── templates/      # Helmテンプレート
    │   ├── workflow-*.yaml  # 機能別Workflowファイル（Helm構文含む）
    │   ├── workflow-template.yaml
    │   ├── cron-workflow.yaml
    │   └── configmap-helm.yaml
    ├── Chart.yaml
    └── values.yaml
```

## Plain YAML版 (`samples/argo/`)

プレーンなArgo WorkflowsマニフェストのサンプルファイルGroup。各ファイルは単一の機能テストに特化しています。

### 基本構文

| ファイル名 | 内容 | テスト機能 |
|-----------|------|----------|
| [workflow-basic.yaml](argo/workflow-basic.yaml) | ローカルテンプレート、steps構造 | template参照のジャンプ機能 |
| [workflow-templateref.yaml](argo/workflow-templateref.yaml) | WorkflowTemplate/ClusterWorkflowTemplate参照 | templateRef解決、クラスタスコープ |
| [workflow-dag.yaml](argo/workflow-dag.yaml) | DAG構造、並列実行 | 依存関係、tasks参照 |

### データフロー

| ファイル名 | 内容 | テスト機能 |
|-----------|------|----------|
| [workflow-parameters.yaml](argo/workflow-parameters.yaml) | inputs/outputs.parameters | steps/tasks参照、クオートパターン |
| [workflow-artifacts.yaml](argo/workflow-artifacts.yaml) | inputs/outputs.artifacts | steps/tasks artifacts参照 |
| [workflow-result.yaml](argo/workflow-result.yaml) | outputs.result（スクリプト結果） | steps/tasks result参照 |

### 変数

| ファイル名 | 内容 | テスト機能 |
|-----------|------|----------|
| [workflow-variables.yaml](argo/workflow-variables.yaml) | workflow.*変数全種類 | workflow.name, parameters, status等 |
| [workflow-item.yaml](argo/workflow-item.yaml) | item変数（withItems/withParam） | スカラー、オブジェクト、配列 |

### リソース定義

| ファイル名 | 内容 | テスト機能 |
|-----------|------|----------|
| [workflow-template.yaml](argo/workflow-template.yaml) | WorkflowTemplate定義 | templateRefのジャンプ先 |
| [cluster-workflow-template.yaml](argo/cluster-workflow-template.yaml) | ClusterWorkflowTemplate定義 | クラスタスコープtemplateRefのジャンプ先 |
| [cron-workflow.yaml](argo/cron-workflow.yaml) | CronWorkflow定義 | スケジュール実行、workflow.scheduledTime |

### 統合サンプル

| ファイル名 | 内容 | テスト機能 |
|-----------|------|----------|
| [comprehensive-workflow.yaml](argo/comprehensive-workflow.yaml) | すべての主要機能を含む包括的なサンプル | ローカルテンプレート参照、パラメータ（inputs/outputs）、Workflow変数、コメント付き定義 |
| **[demo-workflow.yaml](argo/demo-workflow.yaml)** | **Phase 5完了版・全機能デモ** | **Argo Workflows全機能 + ConfigMap/Secret参照を上から順に確認できる包括的デモ** |

**注意**: テストフィクスチャー版（`packages/server/test/fixtures/comprehensive-workflow.yaml`）には意図的なエラーケースが含まれています。正常なサンプルを参照する場合は上記のファイルを使用してください。

### 推奨デモファイル ⭐

**最初に試すべきファイル**: [demo-workflow.yaml](argo/demo-workflow.yaml)

Phase 5完了時点での全機能を、セクション別に段階的に確認できる包括的なデモファイルです：
- Section 1: ConfigMap/Secret定義
- Section 2: WorkflowTemplate定義（ConfigMap/Secret参照含む）
- Section 3: メインワークフロー（全機能統合）
- チェックリスト付き: すべての機能の動作確認手順を記載

## Helm版 (`samples/helm/templates/`)

Helmテンプレート形式のArgo Workflowsサンプルファイル。Plain版と同じArgo構文を提供しつつ、Helm機能も含みます。

### 推奨デモファイル ⭐

**Helm版で最初に試すべきファイル**: [demo-workflow.yaml](helm/templates/demo-workflow.yaml)

Phase 5完了時点での全機能（Argo + Helm）を、セクション別に段階的に確認できる包括的なデモファイルです：
- Section 1: ConfigMap定義（.Values参照、Helm組み込み関数、.Chart/.Release変数）
- Section 2: Secret定義（b64enc関数等）
- Section 3: WorkflowTemplate定義（ConfigMap/Secret参照、include関数）
- Section 4: メインワークフロー（Argo + Helm全機能統合）
- チェックリスト付き: すべての機能の動作確認手順を記載

### 基本構文（Helm版）

| ファイル名 | 内容 | 追加されるHelm機能 |
|-----------|------|------------------|
| [workflow-basic.yaml](helm/templates/workflow-basic.yaml) | ローカルテンプレート、steps構造 | `.Values`参照、Argoエスケープ |
| [workflow-templateref.yaml](helm/templates/workflow-templateref.yaml) | WorkflowTemplate参照 | `include`による名前解決 |
| [workflow-dag.yaml](helm/templates/workflow-dag.yaml) | DAG構造 | Helm変数とDAGの組み合わせ |

### データフロー（Helm版）

| ファイル名 | 内容 | 追加されるHelm機能 |
|-----------|------|------------------|
| [workflow-parameters.yaml](helm/templates/workflow-parameters.yaml) | inputs/outputs.parameters | Helm/Argo変数の混在 |
| [workflow-artifacts.yaml](helm/templates/workflow-artifacts.yaml) | inputs/outputs.artifacts | Helm変数でのパス指定 |
| [workflow-result.yaml](helm/templates/workflow-result.yaml) | outputs.result | Helm変数との組み合わせ |

### 変数（Helm版）

| ファイル名 | 内容 | 追加されるHelm機能 |
|-----------|------|------------------|
| [workflow-variables.yaml](helm/templates/workflow-variables.yaml) | workflow.*変数 | Helm/Argo変数の共存 |
| [workflow-item.yaml](helm/templates/workflow-item.yaml) | item変数 | Helm変数とitem変数 |

### リソース定義・Helm専用機能

| ファイル名 | 内容 | テスト機能 |
|-----------|------|----------|
| [workflow-template.yaml](helm/templates/workflow-template.yaml) | WorkflowTemplate定義 | `include`で解決される名前 |
| [cron-workflow.yaml](helm/templates/cron-workflow.yaml) | CronWorkflow定義 | Helm変数でスケジュール指定 |
| [configmap-helm.yaml](helm/templates/configmap-helm.yaml) | **Helm専用機能テスト** | `include`/`template`ジャンプ、`.Release.*`ホバー |

## 使用方法

### 1. 拡張機能の起動

F5キーで Extension Development Host を起動します。

### 2. サンプルファイルを開く

テストしたい機能に対応するファイルを開きます。

### 3. 機能テスト

各ファイルのヘッダーコメントに記載された「動作確認方法」に従ってテストします。

#### 主要な操作

- **F12 (定義へ移動)**: カーソル位置の要素の定義にジャンプ
- **ホバー**: カーソル位置の要素の詳細情報を表示
- **補完**: 入力時に候補を表示

#### テスト対象機能

- ✅ **template参照のジャンプ**: `template: xxx` で定義にジャンプ
- ✅ **templateRef解決**: `templateRef.template: xxx` で他ファイルにジャンプ
- ✅ **パラメータ参照**: `{{inputs.parameters.xxx}}` で定義にジャンプ
- ✅ **アーティファクト参照**: `{{inputs.artifacts.xxx}}` で定義にジャンプ
- ✅ **steps/tasks出力参照**: `{{steps.xxx.outputs.parameters.yyy}}` で定義にジャンプ
- ✅ **workflow変数ホバー**: `{{workflow.name}}` で説明表示
- ✅ **item変数ホバー**: `{{item}}`, `{{item.xxx}}` で説明表示
- ✅ **Helm include/templateジャンプ**: `{{ include "xxx" . }}` で `_helpers.tpl` の定義にジャンプ
- ✅ **.Release変数ホバー**: `{{ .Release.Name }}` で説明表示

## Plain版とHelm版の違い

### Plain版（`samples/argo/`）

- プレーンなYAML形式
- Argo Workflows構文のみ
- 単体でArgoクラスターにデプロイ可能

### Helm版（`samples/helm/templates/`）

- Helmテンプレート形式
- Argo構文 + Helm構文
- `helm install` でデプロイ
- Argoパラメータは `` {{`{{...}}`}} `` でエスケープ
- `.Values` でHelm変数を参照
- `{{ include "xxx" . }}` でヘルパーテンプレートを参照

## 参考リソース

- [Argo Workflows公式ドキュメント](https://argo-workflows.readthedocs.io/)
- [Helm公式ドキュメント](https://helm.sh/docs/)
