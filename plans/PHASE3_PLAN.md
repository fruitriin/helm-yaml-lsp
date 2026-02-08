# Phase 3 実装計画: 追加機能の実装

**最終更新**: 2026-01-27

## 概要

Phase 2で実装した Definition Provider（定義へのジャンプ）に加えて、以下の機能を実装します。

**Phase 2完了時点での動作確認**:
- ✅ VSCode: F12キーで定義へジャンプ成功
- ✅ Neovim: `gd`キーで定義へジャンプ成功
- ✅ エディタ非依存性の実証

---

## Phase 3.1: Hover Provider の実装

### 目的

カーソル位置のシンボル（テンプレート参照、パラメータ等）にホバーすると、詳細情報をマークダウン形式で表示する。

### 実装内容

#### 3.1.1 テンプレート参照のホバー

**ファイル**: `packages/server/src/providers/hoverProvider.ts`

**機能**:
- templateRef参照にホバー → テンプレート定義の情報を表示
  - テンプレート名
  - 定義されているWorkflowTemplate名
  - コンテナイメージ
  - コメント（aboveComment, inlineComment）

**表示例**:
```markdown
**Template**: `hello`
**WorkflowTemplate**: `my-workflow-template`
**Container**: `alpine:latest`

Print a hello message
```

#### 3.1.2 パラメータ参照のホバー

**機能**:
- パラメータ参照（`{{inputs.parameters.xxx}}`）にホバー
  - パラメータ名
  - デフォルト値
  - 説明（コメントから抽出）

**表示例**:
```markdown
**Parameter**: `message`
**Default**: `"Hello World"`

The message to print
```

#### 3.1.3 実装タスク

- [ ] `HoverProvider`クラス作成
- [ ] `provideHover(document, position)`メソッド実装
- [ ] テンプレート参照のホバー処理
- [ ] パラメータ参照のホバー処理（Phase 3.2後）
- [ ] server.tsへの統合（`connection.onHover`）
- [ ] テスト作成（15+ tests）

**依存関係**:
- `ArgoTemplateIndex` - テンプレート情報取得
- `findTemplateReferenceAtPosition` - カーソル位置の参照検出

#### 3.1.4 テスト内容

**テストファイル**: `packages/server/test/providers/hoverProvider.test.ts`

- テンプレート参照のホバー情報取得
- パラメータ参照のホバー情報取得
- ホバー対象外の位置でnullを返す
- マークダウンフォーマットの検証

---

## Phase 3.2: パラメータ機能の実装

### 目的

パラメータ定義と参照の検出・解決を実装し、Definition/Hover機能を拡張する。

### 実装内容

#### 3.2.1 パラメータ定義の抽出

**ファイル**: `packages/server/src/features/parameterFeatures.ts`

**機能**:
- `inputs.parameters`セクションのパラメータ定義を抽出
- `outputs.parameters`セクションのパラメータ定義を抽出
- パラメータ名、デフォルト値、説明（コメント）を取得

**型定義**:
```typescript
type ParameterDefinition = {
  name: string;
  range: Range;
  uri: string;
  defaultValue?: string;
  description?: string;
  scope: 'inputs' | 'outputs';
  templateName?: string;
};
```

#### 3.2.2 パラメータ参照の検出

**機能**:
- `{{inputs.parameters.xxx}}`パターンの検出
- `{{outputs.parameters.xxx}}`パターンの検出
- `{{workflow.parameters.xxx}}`パターンの検出

**型定義**:
```typescript
type ParameterReference = {
  type: 'inputs' | 'outputs' | 'workflow';
  parameterName: string;
  range: Range;
};
```

#### 3.2.3 実装タスク

- [ ] `findParameterDefinitions(document)`実装
- [ ] `findParameterReferenceAtPosition(document, position)`実装
- [ ] Definition Providerへの統合
- [ ] Hover Providerへの統合
- [ ] テスト作成（20+ tests）

#### 3.2.4 テスト内容

**テストファイル**: `packages/server/test/features/parameterFeatures.test.ts`

- inputs.parametersの抽出
- outputs.parametersの抽出
- デフォルト値の取得
- コメントからの説明抽出
- パラメータ参照の検出（各種パターン）

---

## Phase 3.3: Workflow変数のサポート

### 目的

`{{workflow.*}}`変数の補完とホバー情報を提供する。

### 実装内容

#### 3.3.1 Workflow変数の定義

**ファイル**: `packages/server/src/features/workflowVariables.ts`

**サポートする変数**:
- `{{workflow.name}}` - Workflow名
- `{{workflow.namespace}}` - 名前空間
- `{{workflow.uid}}` - UID
- `{{workflow.parameters.xxx}}` - Workflowパラメータ
- `{{item}}` - withItems/withParamの現在のアイテム
- `{{tasks.xxx.outputs.xxx}}` - タスクの出力参照

#### 3.3.2 実装タスク

- [ ] Workflow変数のリスト定義
- [ ] 各変数の説明文作成
- [ ] Hover Providerへの統合
- [ ] Completion Providerへの統合（Phase 3.4）
- [ ] テスト作成（10+ tests）

---

## Phase 3.4: Completion Provider の実装（基本）

### 目的

入力補完機能を提供し、テンプレート名やパラメータ名の入力を支援する。

### 実装内容

#### 3.4.1 テンプレート名の補完

**ファイル**: `packages/server/src/providers/completionProvider.ts`

**機能**:
- `template: `の後で補完候補を表示
- ローカルテンプレート名のリスト
- WorkflowTemplate/ClusterWorkflowTemplateのテンプレート名

**表示例**:
```
template: hel|
         ↓
- hello          (local template)
- hello-world    (WorkflowTemplate: my-template)
```

#### 3.4.2 パラメータ名の補完

**機能**:
- `{{inputs.parameters.|`で補完
- `{{workflow.parameters.|`で補完
- 定義済みパラメータ名のリスト表示

#### 3.4.3 Workflow変数の補完

**機能**:
- `{{workflow.|`で補完
- サポートするWorkflow変数のリスト表示

#### 3.4.4 実装タスク

- [ ] `CompletionProvider`クラス作成
- [ ] `provideCompletion(document, position)`実装
- [ ] テンプレート名の補完ロジック
- [ ] パラメータ名の補完ロジック
- [ ] Workflow変数の補完ロジック
- [ ] server.tsへの統合（`connection.onCompletion`）
- [ ] テスト作成（15+ tests）

**CompletionItemの種類**:
- `CompletionItemKind.Function` - テンプレート
- `CompletionItemKind.Variable` - パラメータ
- `CompletionItemKind.Property` - Workflow変数

---

## Phase 3.5: 診断機能（Diagnostics）の実装（基本）

### 目的

存在しない参照や型の不一致を検出し、エディタ上で警告を表示する。

### 実装内容

#### 3.5.1 存在しないテンプレート参照の検出

**ファイル**: `packages/server/src/providers/diagnosticProvider.ts`

**機能**:
- `template: xxx`で存在しないテンプレートを参照
- `templateRef`で存在しないWorkflowTemplateを参照
- エラーメッセージと範囲を返す

**診断例**:
```yaml
template: non-existent  # Error: Template 'non-existent' not found
```

#### 3.5.2 存在しないパラメータ参照の検出

**機能**:
- `{{inputs.parameters.xxx}}`で未定義のパラメータを参照
- `{{workflow.parameters.xxx}}`で未定義のパラメータを参照

#### 3.5.3 実装タスク

- [ ] `DiagnosticProvider`クラス作成
- [ ] `provideDiagnostics(document)`実装
- [ ] テンプレート参照の検証
- [ ] パラメータ参照の検証
- [ ] server.tsへの統合（`documents.onDidChangeContent`）
- [ ] テスト作成（10+ tests）

**Diagnosticの重要度**:
- `DiagnosticSeverity.Error` - 存在しない参照
- `DiagnosticSeverity.Warning` - 推奨されない使い方
- `DiagnosticSeverity.Information` - 情報メッセージ

---

## Phase 3.6: ローカルテンプレート参照のサポート

### 目的

同一Workflow内のテンプレート参照（`template: xxx`）の定義ジャンプとホバーを実装する。

### 実装内容

#### 3.6.1 ローカルテンプレートのインデックス

**機能**:
- ドキュメントを開いた時、`spec.templates`配下のテンプレート定義を抽出
- メモリ内にインデックスを保持（ファイル単位）

#### 3.6.2 Definition Providerの拡張

**機能**:
- `template: xxx`参照から、同一ファイル内のテンプレート定義へジャンプ

#### 3.6.3 実装タスク

- [ ] ドキュメント単位のテンプレートインデックス作成
- [ ] Definition Providerに直接参照の処理を追加
- [ ] Hover Providerに直接参照の処理を追加
- [ ] テスト作成（8+ tests）

---

## Phase 3.7: ConfigMap/Secret参照のサポート（基本）

### 目的

ConfigMap/Secretの参照を検出し、定義へのジャンプを可能にする。

### 実装内容

#### 3.7.1 ConfigMap定義のインデックス

**ファイル**: `packages/server/src/services/configMapIndex.ts`

**機能**:
- ConfigMapリソースをインデックス化
- data/binaryDataキーを抽出

#### 3.7.2 ConfigMap参照の検出

**ファイル**: `packages/server/src/features/configmapFeatures.ts`

**機能**:
- `configMapKeyRef`パターンの検出
- `configMap`ボリュームマウントの検出

#### 3.7.3 実装タスク

- [ ] `ConfigMapIndex`クラス作成
- [ ] ConfigMap定義の抽出
- [ ] ConfigMap参照の検出
- [ ] Definition Providerへの統合
- [ ] テスト作成（10+ tests）

---

## 実装順序の推奨

Phase 3の各サブフェーズは以下の順序で実装することを推奨します：

1. **Phase 3.1: Hover Provider** ← まず実装（既存のDefinition Providerと同じパターン）
2. **Phase 3.6: ローカルテンプレート参照** ← Definition/Hoverの基本機能拡張
3. **Phase 3.2: パラメータ機能** ← 新しい機能領域
4. **Phase 3.3: Workflow変数** ← パラメータ機能に依存
5. **Phase 3.4: Completion Provider** ← ユーザー体験向上
6. **Phase 3.5: Diagnostics** ← エラー検出
7. **Phase 3.7: ConfigMap/Secret** ← 高度な機能

---

## Phase 3完了基準

以下がすべて満たされた時点で Phase 3 完了とする：

- [ ] Hover Providerが動作する（VSCode/Neovim）
- [ ] パラメータ定義と参照が検出できる
- [ ] ローカルテンプレート参照がジャンプできる
- [ ] 基本的な補完機能が動作する
- [ ] 存在しない参照がエラー表示される
- [ ] 全テストが通過する（200+ tests想定）
- [ ] ビルドが成功する
- [ ] サンプルファイルで全機能が動作確認できる

---

## 技術的な考慮事項

### パフォーマンス

- インデックス構築は非同期で実行
- 大量ファイルでも高速に動作する必要がある
- キャッシュを活用する

### エディタ非依存性

- すべての機能でVSCode API依存を避ける
- LSP標準プロトコルのみを使用
- Node.js標準ライブラリを優先

### テストカバレッジ

- 各機能で包括的なテストを作成
- エッジケース（空ファイル、不正なYAML等）を考慮
- Phase 3終了時点で200テスト以上を目標

---

## 次のフェーズへ

Phase 3完了後は以下を検討：

- **Phase 4**: Helm機能の拡張
  - `.Values`参照のサポート
  - `include`/`template`関数のサポート
  - Helm Valuesのスキーマ検証

- **Phase 5**: 高度な機能
  - リファクタリング（リネーム）
  - コードアクション
  - ドキュメントシンボル
  - フォーマッタ

- **Phase 6**: パフォーマンス最適化とリリース準備
  - プロファイリング
  - 最適化
  - ドキュメント整備
  - VSCode Marketplace公開
