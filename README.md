# Helm YAML LSP

Argo Workflows Language Server Protocol implementation for Helm and YAML files.

**現在のステータス**: Phase 2 完了 ✅

📋 **開発進捗**: [progress.md](./progress.md)
📘 **開発ガイド**: [CLAUDE.md](./CLAUDE.md)
🗺️ **計画書**: [PHASE1_PLAN.md](./PHASE1_PLAN.md) | [PHASE2_PLAN.md](./PHASE2_PLAN.md) | [PHASE3_PLAN.md](./PHASE3_PLAN.md)

---

## 概要

VSCode拡張機能から独立したLSPサーバーとして、Argo Workflows、Helm、Kubernetes YAMLファイルに対する高度な編集支援機能を提供します。

### 対応エディタ

- **VSCode** - 主要ターゲット（動作確認済み）
- **Neovim** - nvim-lspconfig経由（動作確認済み）
- **その他** - LSP標準プロトコルに準拠した任意のエディタ

### 実装済み機能（Phase 2完了時点）

✅ **Definition Provider（定義へのジャンプ）**
- WorkflowTemplate/ClusterWorkflowTemplateの自動インデックス化
- `templateRef`参照から定義へのジャンプ
- ファイル変更の自動追跡とインデックス更新
- Helmテンプレートの検出と対応

**操作方法**:
- VSCode: `F12`キーで定義へ移動
- Neovim: `gd`キーで定義へ移動

---

## 対応構文の進捗

### Phase 2で実装済み ✅

#### WorkflowTemplate参照

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

#### ClusterWorkflowTemplate参照

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

### Phase 3で実装予定 🚧

#### ローカルテンプレート参照（同一ファイル内）

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - template: hello   # ← 🚧 ジャンプ予定（Phase 3.6）

    - name: hello             # ← ジャンプ先
      container:
        image: alpine
```

#### パラメータ参照

```yaml
spec:
  templates:
    - name: main
      inputs:
        parameters:
          - name: message     # ← 🚧 定義（Phase 3.2）
            default: "Hello"
      container:
        image: alpine
        args:
          - "{{inputs.parameters.message}}"  # ← 🚧 参照（Phase 3.2）
```

#### Workflow変数

```yaml
# 🚧 Phase 3.3で実装予定
{{workflow.name}}                    # Workflow名
{{workflow.namespace}}               # 名前空間
{{workflow.parameters.xxx}}          # Workflowパラメータ
{{item}}                             # withItems/withParamの現在のアイテム
{{tasks.xxx.outputs.xxx}}            # タスクの出力参照
```

#### ConfigMap/Secret参照

```yaml
# ConfigMap定義
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  key: value              # ← 🚧 定義（Phase 3.7）

---
# Workflow（参照元）
env:
  - name: CONFIG
    valueFrom:
      configMapKeyRef:
        name: my-config
        key: key          # ← 🚧 参照（Phase 3.7）
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
│   │   │   │   └── templateFeatures.ts
│   │   │   ├── services/
│   │   │   │   ├── fileWatcher.ts
│   │   │   │   └── argoTemplateIndex.ts
│   │   │   └── providers/
│   │   │       └── definitionProvider.ts
│   │   ├── test/                    # 116 tests
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
bun run test                # 116 tests
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
- **Definition Provider** ← 現在ここ

**テスト**: 116 tests passed
**動作確認**: VSCode ✅ | Neovim ✅

### Phase 3: 追加機能の実装 🚧

予定機能（詳細は [PHASE3_PLAN.md](./PHASE3_PLAN.md)）:

1. **Hover Provider** - ホバー情報の表示
2. **パラメータ機能** - パラメータ定義と参照
3. **Completion Provider** - 入力補完
4. **Diagnostics** - エラー検出
5. **ローカルテンプレート参照**
6. **ConfigMap/Secret参照**

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
bun run test                # 全テスト実行（116 tests）
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
- **[PHASE3_PLAN.md](./PHASE3_PLAN.md)** - Phase 3詳細計画
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

**開発状況**: Phase 2完了（Definition Provider実装済み） | Phase 3準備中
