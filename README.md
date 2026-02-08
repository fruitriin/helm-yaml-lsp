# Helm YAML LSP

Argo Workflows Language Server Protocol implementation for Helm and YAML files.

**841 tests passed** | Phase 15 完了

---

## 概要

VSCode拡張機能から独立したLSPサーバーとして、Argo Workflows、Helm、Kubernetes YAMLファイルに対する高度な編集支援機能を提供します。

### 対応エディタ

- **VSCode** - 主要ターゲット
- **Neovim** - nvim-lspconfig経由
- **IntelliJ IDEA / JetBrains** - プラグイン（基本実装完了）
- **その他** - LSP標準プロトコルに準拠した任意のエディタ

---

## 機能一覧

### Argo Workflows

- WorkflowTemplate / ClusterWorkflowTemplate の自動インデックス化
- `templateRef` 参照から定義へのジャンプ
- ローカルテンプレート参照（同一ファイル内）
- パラメータ定義と参照（inputs/outputs.parameters）
- アーティファクト参照（inputs/outputs.artifacts、steps/tasks.outputs.artifacts）
- スクリプト結果参照（steps/tasks.outputs.result）
- Item変数（`{{item}}`, `{{item.xxx}}`）と withItems/withParam ソースへのジャンプ
- Workflow変数（workflow.name 等10種 + サブプロパティ）
- Workflow出力参照（workflow.outputs.parameters/artifacts）

### Helm

- Helm Chart構造の自動検出
- values.yaml の解析とインデックス化
- `.Values` 参照のサポート（Definition/Hover/Completion/Diagnostics）
- `{{ include }}` / `{{ template }}` 関数のサポート
- Helm組み込み関数のサポート（70+ functions）
- `.Chart`, `.Release`, `.Capabilities` 変数のサポート
- `_helpers.tpl` ファイルのサポート
- Go template 制御構文のHover/Completion
- `helm template` レンダリング後のYAMLに対するArgo/ConfigMap診断

### ConfigMap/Secret

- ConfigMap/Secret定義の自動検出
- `configMapKeyRef` / `secretKeyRef` 参照のサポート
- `configMapRef` / `secretRef`（envFrom）のサポート
- `volumeConfigMap` / `volumeSecret` のサポート
- マルチライン値のプレビュー表示

### LSP機能

| 機能 | 説明 |
|------|------|
| **Definition** | 定義へのジャンプ（F12 / gd） |
| **Hover** | ホバー情報の表示 |
| **Completion** | 入力補完 |
| **Diagnostics** | エラー検出と表示 |
| **Document Symbol** | YAMLアウトライン（マルチドキュメント対応） |
| **Document Highlight** | Helmブロック構造の対応タグハイライト |
| **Semantic Tokens** | Go templateの構文ハイライト |

---

## セットアップ

### 前提条件

- **Node.js** 18以上
- **Bun** 1.0以上

### インストール

```bash
git clone --recursive https://github.com/yourusername/helm-yaml-lsp.git
cd helm-yaml-lsp
bun install
bun run build
```

### VSCodeで使用

```bash
# F5キーでExtension Development Hostを起動
# または
bun run package  # VSIXパッケージを作成
```

### Neovimで使用

```lua
require('argo-workflows-lsp').setup({
  server_path = '/path/to/server.js',
  settings = {
    argoWorkflowsLSP = {
      enableDiagnostics = true,
      enableHover = true,
      enableDefinition = true,
      enableCompletion = true,
    }
  }
})
```

---

## 開発

### コマンド

```bash
# ビルド
bun run build               # 全パッケージをビルド
bun run watch               # ウォッチモード

# テスト
bun run test                # 全テスト実行（※ bun test は不可）

# コード品質
bun run check               # 型チェック + Biome
bun run check:write         # Biome自動修正（format + lint）

# パッケージング
bun run package             # VSIXパッケージ作成
```

### デバッグ

**VSCode**: F5 → 「Client + Server」を選択 → Extension Development Host でサンプルYAMLを開く

**Neovim**: `nvim samples/argo/workflow-templateref.yaml` → `gd` で定義ジャンプ

---

## プロジェクト構造

```
helm-yaml-lsp/
├── packages/
│   ├── server/                        # Language Server（エディタ非依存）
│   │   ├── src/
│   │   │   ├── server.ts              # エントリポイント
│   │   │   ├── types/                 # 型定義
│   │   │   ├── utils/                 # URI処理、ファイル操作
│   │   │   ├── features/             # 各機能の解析ロジック
│   │   │   ├── services/             # インデックスサービス
│   │   │   ├── providers/            # LSPプロバイダー
│   │   │   └── references/           # 統一参照解決（ReferenceHandler）
│   │   └── test/                      # 841+ tests
│   ├── vscode-client/                 # VSCode拡張
│   ├── nvim-client/                   # Neovim拡張
│   └── intellij-plugin/              # IntelliJ Plugin
├── samples/                           # テスト用サンプル（改変禁止）
│   ├── argo/                          # Plain YAML版
│   └── helm/                          # Helm版
└── vscode-kubernetes-tools-argo/      # 移行元（git submodule）
```

---

## 設定

### VSCode

```json
{
  "argoWorkflowsLSP.enableDiagnostics": true,
  "argoWorkflowsLSP.enableHover": true,
  "argoWorkflowsLSP.enableDefinition": true,
  "argoWorkflowsLSP.enableCompletion": true,
  "argoWorkflowsLSP.maxNumberOfProblems": 1000
}
```

### Neovim

```lua
require('argo-workflows-lsp').setup({
  settings = {
    argoWorkflowsLSP = {
      enableDiagnostics = true,  -- false でエラー診断を無効化
    }
  }
})
```

---

## 技術スタック

- **言語**: TypeScript（strict mode）
- **ツールチェイン**: Bun（パッケージマネージャ & バンドラ & テストランナー）
- **Linter/Formatter**: Biome
- **LSP**: vscode-languageserver（エディタ非依存）
- **ファイル検索**: fast-glob

---

## ライセンス

MIT License

---

## 参考リンク

- [Argo Workflows](https://argoproj.github.io/argo-workflows/)
- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- [Bun](https://bun.sh/)
- [Biome](https://biomejs.dev/)
