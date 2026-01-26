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
cd packages/client && bun run build
```

### Linter & Formatter (Biome)

```bash
bun run lint                # コードをlint
bun run lint:fix            # lintエラーを自動修正
bun run format              # フォーマットチェック
bun run format:write        # コードをフォーマット
bun run check               # lintとformatの両方をチェック
bun run check:write         # すべてのエラーを自動修正（safe fix）
bunx biome check --write --unsafe .  # unsafe fixも適用
```

### その他

```bash
bun run test                # テスト実行
bun run package             # VSIXパッケージ作成
```

## デバッグ

1. VSCodeで `F5` キーを押す、または「実行とデバッグ」から起動設定を選択
   - **Launch Extension**: クライアント拡張のみ起動
   - **Attach to Server**: サーバープロセスにアタッチ
   - **Client + Server**: クライアントとサーバーを同時デバッグ（推奨）

2. Extension Development Hostウィンドウで `samples/test-workflow.yaml` を開く

3. ホバー、定義へ移動、補完などのLSP機能をテスト

## LSP移行ステータス

### Phase 1: プロジェクト構造のセットアップ ✅

- モノレポ構造（bun workspaces）
- packages/server と packages/client のセットアップ
- ビルドシステム（bun build）
- デバッグ環境（.vscode/launch.json）
- パスエイリアス（"@/"）の設定

### Phase 2: コア機能の移植（次のステップ）

1. 型定義とユーティリティの移植
2. YAMLパーサー層の移行
3. インデックスサービスの移行
4. Definition/Hover Providerの実装

詳細は `vscode-kubernetes-tools-argo/LSP_MIGRATION_PLAN.md` を参照。