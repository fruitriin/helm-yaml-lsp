# Phase 3 実装デモ - 動作確認ガイド

このドキュメントでは、Phase 3で実装した機能をデモファイル（`demo-phase3.yaml`）を使って確認する方法を説明します。

## 実装済み機能

### ✅ Phase 3.1: Hover Provider
- テンプレート参照にマウスをホバーすると詳細情報が表示される
- テンプレート名、WorkflowTemplate名、コメントを表示

### ✅ Phase 3.6: ローカルテンプレート参照
- 同一ファイル内の`template: xxx`参照から定義へジャンプ
- ローカルテンプレートのホバー情報表示

### ✅ Phase 2: Definition Provider
- `templateRef`参照からWorkflowTemplate/ClusterWorkflowTemplateの定義へジャンプ

## セットアップ

### 1. 必要なファイルの確認

デモに必要なファイル：
- `demo-phase3.yaml` - メインのデモファイル
- `workflow-template.yaml` - WorkflowTemplateの定義
- `cluster-workflow-template.yaml` - ClusterWorkflowTemplateの定義

すべて`samples/argo/`ディレクトリに配置されています。

### 2. Extension Development Hostの起動

#### VSCode
1. プロジェクトルートでF5キーを押す
2. または「実行とデバッグ」から「Client + Server」を選択
3. 新しいVSCodeウィンドウ（Extension Development Host）が起動

#### Neovim
```bash
# サーバーが自動起動するはずですが、手動で起動する場合：
cd packages/server
bun run build
node dist/server.js --stdio
```

## 動作確認項目

### 確認ポイント1: ローカルテンプレート参照のジャンプ

**場所**: 45行目付近

```yaml
- name: greet
  template: greet-user  # ← ここにカーソルを置く
```

**操作**:
- **VSCode**: F12キーを押す
- **Neovim**: `gd`キーを押す

**期待される動作**:
- 68行目の`- name: greet-user`へジャンプ

### 確認ポイント2: ローカルテンプレートのホバー

**場所**: 45行目付近

```yaml
template: greet-user  # ← ここにマウスをホバー
```

**操作**:
- **VSCode**: マウスをテキストの上に乗せる
- **Neovim**: カーソルを置いて`K`キーを押す

**期待される動作**:
ホバー情報が表示される：
```
**Template**: `greet-user`
**Location**: Local template in current Workflow

User greeting template

Prints a personalized greeting
```

### 確認ポイント3: WorkflowTemplate参照のジャンプ

**場所**: 56行目付近

```yaml
templateRef:
  name: hello-world-template
  template: hello  # ← ここにカーソルを置く
```

**操作**:
- F12キー（VSCode）または`gd`（Neovim）

**期待される動作**:
- `workflow-template.yaml`ファイルが開く
- `- name: hello`の定義へジャンプ

### 確認ポイント4: WorkflowTemplateのホバー

**場所**: 56行目付近

```yaml
template: hello  # ← ここにマウスをホバー
```

**期待される動作**:
ホバー情報が表示される：
```
**Template**: `hello`
**WorkflowTemplate**: `hello-world-template`

Simple hello world container
Prints hello world
```

### 確認ポイント5: ClusterWorkflowTemplate参照

**場所**: 67行目付近

```yaml
templateRef:
  name: cluster-hello-template
  template: cluster-hello  # ← ここで確認
  clusterScope: true
```

**操作**:
- F12でジャンプ
- ホバーで情報確認

**期待される動作**:
- `cluster-workflow-template.yaml`へジャンプ
- ホバーで「**ClusterWorkflowTemplate**」と表示される

### 確認ポイント6: 複数テンプレートのナビゲーション

**場所**: 123-134行目付近

```yaml
- name: process-step
  template: process-data  # ← F12でジャンプ

- name: aggregate-step
  template: aggregate-results  # ← F12でジャンプ
```

**操作**:
各テンプレート参照でF12キーを押す

**期待される動作**:
- それぞれのテンプレート定義（93行目、104行目）へジャンプ

## トラブルシューティング

### ホバーが表示されない

1. サーバーが起動しているか確認
   - VSCode: 出力パネル > "Argo Workflows LSP"
   - Neovim: `:LspInfo`

2. ファイルがArgo Workflowとして認識されているか確認
   - `kind: Workflow`が含まれているか

### ジャンプが動作しない

1. WorkflowTemplate/ClusterWorkflowTemplateファイルが存在するか確認
   ```bash
   ls samples/argo/workflow-template.yaml
   ls samples/argo/cluster-workflow-template.yaml
   ```

2. サーバーログでインデックスが構築されているか確認
   ```
   [ArgoTemplateIndex] Initialized with X WorkflowTemplates
   ```

### ローカルテンプレート参照が動作しない

1. テンプレート名が正確に一致しているか確認
2. YAMLのインデントが正しいか確認

## デバッグログの確認

### VSCode
1. デバッグコンソールを開く（Ctrl+Shift+Y / Cmd+Shift+Y）
2. 「Argo Workflows Language Server」の出力を確認

### Neovim
```vim
:LspLog
```

## 次のステップ

Phase 3で未実装の機能：
- パラメータ参照のジャンプとホバー（`{{inputs.parameters.xxx}}`）
- Completion Provider（入力補完）
- Diagnostics（エラー検出）

これらの機能は今後のフェーズで実装予定です。

## フィードバック

問題や改善提案がある場合は、GitHubリポジトリにissueを作成してください。
