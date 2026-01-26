# Helm YAML LSP

Argo Workflows Language Server Protocol implementation for Helm and YAML files.

📋 **開発進捗**: [progress.md](./progress.md)

## プロジェクト構造

```
helm-yaml-lsp/
├── packages/
│   ├── server/          # Language Server (Node.js)
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   └── types/   # 型定義（"@/types" でインポート可能）
│   │   └── package.json
│   └── client/          # VSCode Client Extension
│       ├── src/
│       │   ├── extension.ts
│       │   └── types/   # 型定義（"@/types" でインポート可能）
│       └── package.json
├── .vscode/             # デバッグ設定
├── bunfig.toml          # Bun設定
├── package.json         # ワークスペースルート
└── README.md
```

## パスエイリアス

プロジェクトでは `"@/"` エイリアスが設定されており、`src/` ディレクトリを参照できます。

```typescript
// 通常のインポート
import { ServerSettings } from '../types';

// "@/" エイリアスを使用したインポート（推奨）
import { ServerSettings } from '@/types';
```

この設定は各パッケージの `tsconfig.json` で定義されており、bunが自動的に解決します。

## セットアップ

### 前提条件

- Node.js 18以上
- Bun 1.0以上

### インストール

```bash
# 依存関係をインストール
bun install

# ビルド
bun run build
```

## 開発

### ウォッチモード

```bash
# 全パッケージをウォッチモードで起動
bun run watch
```

### デバッグ

1. VSCodeで `F5` キーを押す、または「実行とデバッグ」から「Launch Extension」を選択
2. 新しいVSCodeウィンドウ (Extension Development Host) が開きます
3. YAMLファイルを開いて、LSP機能を確認できます

### サーバーのデバッグ

1. 「実行とデバッグ」から「Client + Server」を選択
2. クライアントとサーバーの両方をデバッグできます

## Phase 1 完了事項

✅ モノレポ構造の作成（bun workspaces）
✅ packages/server のセットアップ（LSPサーバー）
✅ packages/client のセットアップ（VSCode拡張）
✅ ビルドシステムの構築（TypeScript、bun build）
✅ 開発・デバッグ環境の構築（.vscode/launch.json）

## 提供機能（Phase 1）

- ✅ 基本的なLSPサーバー起動
- ✅ ホバー機能（デモ）
- ✅ 定義へ移動機能（スケルトン）
- ✅ 補完機能（デモ）

## 次のステップ（Phase 2）

Phase 2では、以下の機能を実装します：

1. 型定義とユーティリティの移植
2. YAMLパーサー層の移行
3. インデックスサービスの移行
4. Definition Providerの完全実装
5. Hover Providerの完全実装

詳細は `vscode-kubernetes-tools-argo/LSP_MIGRATION_PLAN.md` を参照してください。

## スクリプト

### ビルド

- `bun run build` - 全パッケージをビルド
- `bun run watch` - 全パッケージをウォッチモード起動
- `bun run clean` - ビルド成果物を削除

### Linter & Formatter (Biome)

- `bun run lint` - コードをlint
- `bun run lint:fix` - lintエラーを自動修正
- `bun run format` - フォーマットチェック
- `bun run format:write` - コードをフォーマット
- `bun run check` - lintとformatの両方をチェック
- `bun run check:write` - すべてのエラーを自動修正

### その他

- `bun run test` - テストを実行
- `bun run package` - VSIXパッケージを作成

## ライセンス

MIT
