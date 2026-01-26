このプロジェクトは、 helm の中に書かれた argo workflows yaml に対して LSPを提供することを目的とする。

## 対象実行環境
VSCode
NeoVim

### 絶対に守るべき原則

1. **サーバーコアはエディタ非依存**
   - VSCode API (`vscode.*`) を一切使用しない
   - Node.js標準ライブラリとエディタ非依存のnpmパッケージのみ使用
   - LSP標準プロトコル (`vscode-languageserver`) のみに依存

2. **純粋なLSP実装**
   - すべての機能をLSPプロトコルの標準メッセージで実装
   - カスタムプロトコル拡張は最小限に抑える
   - クライアント側の実装は薄いラッパーに留める

3. **クロスプラットフォーム**
   - Windows、macOS、Linuxで動作
   - パス処理はNode.js標準の`path`と`url`モジュールを使用
   - プラットフォーム固有の処理は抽象化

## ツールチェイン
パッケージマネージャ、バンドラとしてbunを使うこと


## ディレクトリ
vscode-kubernetes-tools-argo - 前身となる VSCode Extention。 git submodule 化しているので、このコードを好きなだけ参照してよい。


## 開発方針
各フェーズが完了するごとに、

- 必ずテストコードを作って通ることを検証すること。この最中に誤りが発見された場合、これを修正すること。
- フェーズが完了する前にレビューを行い、コードをシンプルに保つこと

## コーディングルール

### Linter & Formatter

プロジェクトでは **Biome** をlinterとformatterとして使用しています。

```bash
# コードをチェック＆修正
bun run check:write

# エディタ統合: Biome拡張機能をインストール
# VSCodeで自動的に推奨されます（.vscode/extensions.json）
```

### TypeScript

- **型定義**: `interface` より `type` を好む（Biomeルール）
- **strict モード有効**: `strict: true`
- **未使用変数の扱い**: 将来使用する変数には `_` プレフィックスを付ける（例: `_globalSettings`）
- **型定義の配置**: 各パッケージの `src/types/` に配置
- **import文**: `type` キーワードを使用して型のみのimportを明示（Biomeルール）
- **Node.js組み込みモジュール**: `node:` プロトコルを使用（例: `import * as path from 'node:path'`）

### パスエイリアス

`"@/"` エイリアスを使用して `src/` ディレクトリを参照できます。

```typescript
// ❌ 相対パス（深いネストで読みにくい）
import { ServerSettings } from '../../../types';

// ✅ "@/" エイリアス（推奨）
import { ServerSettings } from '@/types';
```

設定は各パッケージの `tsconfig.json` で定義：
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### インポート順序

1. Node.js標準ライブラリ
2. 外部パッケージ（vscode-languageserver等）
3. "@/" エイリアスを使用した内部モジュール

```typescript
import * as path from 'path';
import { createConnection } from 'vscode-languageserver/node';
import { ServerSettings } from '@/types';
```

## プロジェクト構造

```
helm-yaml-lsp/
├── packages/
│   ├── server/              # Language Server (Node.js)
│   │   ├── src/
│   │   │   ├── server.ts    # LSPサーバーエントリポイント
│   │   │   └── types/       # 型定義（"@/types" でインポート可能）
│   │   ├── dist/            # ビルド成果物
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── client/              # VSCode Client Extension
│       ├── src/
│       │   ├── extension.ts # VSCode拡張エントリポイント
│       │   └── types/       # 型定義（"@/types" でインポート可能）
│       ├── dist/            # ビルド成果物
│       ├── package.json
│       └── tsconfig.json
├── .vscode/                 # デバッグ設定
│   ├── launch.json          # デバッグ起動設定
│   ├── tasks.json           # ビルドタスク
│   └── settings.json        # エディタ設定
├── vscode-kubernetes-tools-argo/  # 元のVSCode拡張（移行元）
├── samples/                 # テスト用サンプルファイル
├── bunfig.toml              # Bun設定
├── package.json             # ワークスペースルート
├── tsconfig.json            # 共通TypeScript設定
└── README.md
```

## ビルドコマンド

### ビルド

```bash
bun install                  # 依存関係のインストール
bun run build               # 全パッケージをビルド
bun run watch               # ウォッチモード（自動再コンパイル）
bun run clean               # ビルド成果物を削除
```

個別パッケージのビルド：
```bash
cd packages/server && bun run build
cd packages/vscode-client && bun run build
```

### コード品質チェック

```bash
# 完全なチェック（型チェック + Biome）
bun run check               # TypeScript型チェック + Biome lint/format

# 個別チェック
bun run typecheck           # TypeScript型チェック（IDE diagnosticsと同等）
bun run lint                # Biome lint
bun run format              # Biome formatチェック

# 自動修正
bun run check:write         # Biomeで自動修正（safe fix）
bun run lint:fix            # lintエラーを自動修正
bun run format:write        # コードをフォーマット
bunx biome check --write --unsafe .  # unsafe fixも適用
```

### テスト

```bash
bun run test                # テスト実行（推奨）
bun run test:packages       # 各パッケージのテスト実行
bun run test:all            # 統合 + パッケージテスト
```

**重要**: `bun run test` を使用してください（`bun test` ではなく）。
直接 `bun test` を実行すると、サブモジュールのテストも検索されてしまいます。

### パッケージング

```bash
bun run package             # VSIXパッケージ作成
```

## デバッグ

**詳細なデバッグ手順は [DEBUG_GUIDE.md](./DEBUG_GUIDE.md) を参照してください。**

### クイックスタート

1. VSCodeで `F5` キーを押す、または「実行とデバッグ」から起動設定を選択
   - **Launch Extension**: クライアント拡張のみ起動
   - **Attach to Server**: サーバープロセスにアタッチ
   - **Client + Server**: クライアントとサーバーを同時デバッグ（推奨）

2. Extension Development Hostウィンドウで `samples/test-workflow.yaml` を開く

3. ホバー、定義へ移動、補完などのLSP機能をテスト

### デバッグログの確認

拡張が正しく読み込まれると、**デバッグコンソール**に以下のログが出力されます：

```
🚀 Argo Workflows LSP Extension is now activating...
📂 Server module path: /path/to/server/dist/server.js
🔍 Debug port: 6009
🔌 Starting Language Server client...
✅ Argo Workflows LSP Extension activated
🚀 Argo Workflows Language Server starting...
👂 Document manager listening...
✅ Argo Workflows Language Server is now listening for client connections
📋 Server initialization phase...
  ✓ Configuration capability enabled
  ✓ Workspace folder capability enabled
✅ Argo Workflows Language Server initialized successfully
✅ Argo Workflows Language Server is ready!
```

### デバッグポートのカスタマイズ

デバッグポートをカスタマイズする場合は、環境変数 `LSP_DEBUG_PORT` を設定してください：

```bash
export LSP_DEBUG_PORT=6010
```

または、`.vscode/launch.json` の設定で直接指定することもできます。

## LSP移行ステータス

### Phase 1: プロジェクト構造のセットアップ ✅

- モノレポ構造（bun workspaces）
- packages/server と packages/vscode-client のセットアップ
- ビルドシステム（bun build）
- デバッグ環境（.vscode/launch.json）
- パスエイリアス（"@/"）の設定

### Phase 2: コア機能の移植（次のステップ）

1. 型定義とユーティリティの移植
2. YAMLパーサー層の移行
3. インデックスサービスの移行
4. Definition/Hover Providerの実装

詳細は `vscode-kubernetes-tools-argo/LSP_MIGRATION_PLAN.md` を参照。