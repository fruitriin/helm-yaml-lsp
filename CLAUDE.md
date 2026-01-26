# Helm YAML LSP - Claude Code ガイド

このプロジェクトは、Helm内に書かれたArgo Workflows YAMLに対してLSP（Language Server Protocol）を提供することを目的とする。

**最終更新**: 2026-01-27
**現在のステータス**: Phase 2 完了 ✅

---

## プロジェクト概要

### 目的

VSCode拡張機能から独立したLSPサーバーとして、Argo Workflows、Helm、Kubernetes YAMLファイルに対する高度な編集支援機能を提供する。

### 対象エディタ

- **VSCode** - 主要ターゲット
- **Neovim** - nvim-lspconfig経由で動作確認済み
- **その他のLSPクライアント** - LSP標準プロトコルに準拠した任意のエディタ

### 実装済み機能（Phase 2完了時点）

✅ **Definition Provider（定義へのジャンプ）**
- WorkflowTemplate/ClusterWorkflowTemplateのインデックス化
- templateRef参照から定義へのジャンプ
- VSCode: F12キー
- Neovim: `gd`キー

✅ **エディタ非依存性の実証**
- VSCode API依存ゼロ
- Node.js標準ライブラリのみ使用
- 両エディタで同じLSPサーバーが動作

---

## 絶対に守るべき原則

### 1. サーバーコアはエディタ非依存

- ❌ VSCode API (`vscode.*`) を一切使用しない
- ✅ Node.js標準ライブラリとエディタ非依存のnpmパッケージのみ使用
- ✅ LSP標準プロトコル (`vscode-languageserver`) のみに依存

**検証方法**:
```bash
# ESLintでVSCode API使用をチェック
bun run lint:eslint

# サーバー単体起動テスト
cd packages/server && bun test
```

### 2. 純粋なLSP実装

- すべての機能をLSPプロトコルの標準メッセージで実装
- カスタムプロトコル拡張は最小限に抑える
- クライアント側の実装は薄いラッパーに留める

**実装されているLSP機能**:
- `textDocument/definition` - 定義へ移動
- `textDocument/hover` - ホバー情報（Phase 3で拡張予定）
- `workspace/didChangeWatchedFiles` - ファイル監視
- `initialize` / `initialized` - サーバー初期化

### 3. クロスプラットフォーム

- Windows、macOS、Linuxで動作
- パス処理はNode.js標準の`path`と`url`モジュールを使用
- プラットフォーム固有の処理は抽象化

---

## ツールチェイン

### パッケージマネージャ & バンドラ

**Bun** を使用（高速、TypeScriptネイティブサポート）

```bash
bun install                  # 依存関係のインストール
bun run build               # 全パッケージをビルド
bun run watch               # ウォッチモード
bun run test                # テスト実行
```

### Linter & Formatter

**Biome** を使用（Rust製、高速）

```bash
# コードチェック＆修正
bun run check:write

# 型チェック込みの完全チェック
bun run check               # TypeScript型チェック + Biome
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
│   │   │   │   ├── uriUtils.ts      # URI処理（Node.js標準）
│   │   │   │   └── fileSystem.ts    # ファイル操作（fast-glob）
│   │   │   ├── features/
│   │   │   │   ├── documentDetection.ts  # ドキュメント検出
│   │   │   │   └── templateFeatures.ts   # テンプレート機能
│   │   │   ├── services/
│   │   │   │   ├── fileWatcher.ts        # ファイル監視
│   │   │   │   └── argoTemplateIndex.ts  # テンプレートインデックス
│   │   │   └── providers/
│   │   │       └── definitionProvider.ts # Definition Provider
│   │   ├── test/                    # テスト（116 tests）
│   │   ├── dist/                    # ビルド成果物
│   │   └── package.json
│   ├── vscode-client/               # VSCode拡張
│   │   ├── src/
│   │   │   └── extension.ts        # VSCodeクライアント
│   │   ├── dist/
│   │   └── package.json
│   └── nvim-client/                 # Neovim拡張
│       └── lua/argo-workflows-lsp/init.lua
├── samples/                         # テスト用サンプル
│   ├── argo/                        # Plain YAML版（11ファイル）
│   └── helm/                        # Helm版
├── vscode-kubernetes-tools-argo/    # 移行元プロジェクト（git submodule）
├── PHASE1_PLAN.md                   # Phase 1詳細計画
├── PHASE2_PLAN.md                   # Phase 2詳細計画
├── PHASE3_PLAN.md                   # Phase 3詳細計画
├── progress.md                      # 進捗記録
└── README.md
```

---

## コーディングルール

### TypeScript

- **型定義**: `interface` より `type` を好む（Biomeルール）
- **strict モード**: `strict: true`
- **未使用変数**: `_` プレフィックスを付ける（例: `_globalSettings`）
- **型のimport**: `import type { Foo } from 'bar'` を使用
- **Node.js組み込みモジュール**: `node:` プロトコルを使用

```typescript
// ✅ Good
import type { Range } from 'vscode-languageserver-types';
import * as path from 'node:path';
import { ArgoTemplateIndex } from '@/services/argoTemplateIndex';

type TemplateDefinition = {
  name: string;
  range: Range;
};
```

### パスエイリアス

`"@/"` エイリアスを使用して `src/` ディレクトリを参照：

```typescript
// ❌ 相対パス
import { ServerSettings } from '../../../types';

// ✅ "@/" エイリアス（推奨）
import { ServerSettings } from '@/types';
```

### インポート順序

1. Node.js標準ライブラリ
2. 外部パッケージ（vscode-languageserver等）
3. "@/" エイリアスを使用した内部モジュール

```typescript
import * as path from 'node:path';
import { createConnection } from 'vscode-languageserver/node';
import type { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
```

---

## ビルドコマンド

### 開発

```bash
bun run build               # 全パッケージをビルド
bun run watch               # ウォッチモード（自動再コンパイル）
bun run clean               # ビルド成果物を削除
```

### コード品質

```bash
bun run check               # 型チェック + Biome（完全チェック）
bun run typecheck           # TypeScript型チェックのみ
bun run lint                # Biome lint
bun run format              # Biome formatチェック

# 自動修正
bun run check:write         # Biomeで自動修正（safe fix）
bun run lint:fix            # lintエラーを自動修正
```

### テスト

```bash
bun run test                # 全テスト実行（116 tests）
bun run test:packages       # 各パッケージのテスト実行
bun run test:all            # 統合 + パッケージテスト
```

**重要**: `bun run test` を使用してください（`bun test` ではなく）。
直接 `bun test` を実行すると、サブモジュールのテストも検索されてしまいます。

---

## デバッグ

### VSCode

1. `F5` キーを押す、または「実行とデバッグ」から起動設定を選択
   - **Launch Extension**: クライアント拡張のみ起動
   - **Attach to Server**: サーバープロセスにアタッチ
   - **Client + Server**: クライアントとサーバーを同時デバッグ（推奨）

2. Extension Development Hostウィンドウで `samples/argo/workflow-templateref.yaml` を開く

3. `F12`キー（定義へ移動）でジャンプをテスト

### Neovim

```bash
# サンプルファイルを開く
nvim samples/argo/workflow-templateref.yaml

# LSP状態確認
:LspInfo

# 定義へジャンプ（gdキー）
# templateRef参照の上で gd を押す
```

### デバッグログの確認

サーバー起動時のログ：

```
🚀 Argo Workflows Language Server starting...
📋 Server initialization phase...
  ✓ Configuration capability enabled
  ✓ Workspace folder capability enabled
[ArgoTemplateIndex] Initializing...
[ArgoTemplateIndex] Initialized with N WorkflowTemplates
✅ Argo Workflows Language Server initialized successfully
```

---

## 開発フロー

### 新機能の追加

1. **計画書の確認**
   - `PHASE3_PLAN.md` で実装する機能を確認
   - 依存関係と実装順序を把握

2. **実装**
   - `packages/server/src/` 配下に実装ファイルを作成
   - `@/` エイリアスを使用してインポート
   - LSP標準型を使用（`Range`, `Position`, `Location`等）

3. **テスト作成**
   - `packages/server/test/` 配下にテストファイルを作成
   - 包括的なテストケースを記述
   - `bun test` で実行確認

4. **動作確認**
   - VSCodeとNeovim両方で動作確認
   - サンプルファイルを使用してテスト

5. **コミット**
   - `bun run check` でコード品質チェック
   - コミットメッセージに機能説明を記載

### フェーズ完了時のレビュー

各フェーズ完了時に以下を確認：

- [ ] すべてのテストが通過している
- [ ] `bun run check` が成功している
- [ ] VSCodeとNeovimで動作確認済み
- [ ] progress.mdに進捗を記録
- [ ] コードがシンプルに保たれている

---

## 実装済み機能の詳細

### Phase 1: プロジェクト構造のセットアップ ✅

- モノレポ構造（bun workspaces）
- packages/server と packages/vscode-client のセットアップ
- ビルドシステム（bun build）
- デバッグ環境（.vscode/launch.json）
- パスエイリアス（"@/"）の設定
- Neovimクライアント実装
- テストインフラ整備（116 tests）

### Phase 2: コア機能の移植 ✅

**実装ファイル**（7ファイル）:
1. `types/argo.ts` - LSP標準型への変換
2. `utils/uriUtils.ts` - URI処理（Node.js標準）
3. `utils/fileSystem.ts` - ファイル操作（fast-glob）
4. `services/fileWatcher.ts` - ファイル監視（LSP標準）
5. `features/documentDetection.ts` - ドキュメント検出
6. `features/templateFeatures.ts` - テンプレート機能
7. `services/argoTemplateIndex.ts` - テンプレートインデックス
8. `providers/definitionProvider.ts` - Definition Provider

**テスト結果**: 116 tests passed, 0 fail

**動作確認**:
- ✅ VSCodeで定義ジャンプ成功（F12キー）
- ✅ Neovimで定義ジャンプ成功（`gd`キー）

---

## 次のフェーズ（Phase 3）

### 実装予定機能

1. **Hover Provider** - ホバー情報の表示
2. **パラメータ機能** - パラメータ定義と参照の検出
3. **Completion Provider** - 入力補完機能
4. **Diagnostics** - 診断機能（エラー検出）
5. **ローカルテンプレート参照** - 同一ファイル内のテンプレートジャンプ
6. **ConfigMap/Secret参照** - ConfigMap参照のサポート

詳細は `PHASE3_PLAN.md` を参照。

---

## 参考ドキュメント

### プロジェクト内ドキュメント

- **progress.md** - 開発進捗の詳細記録
- **PHASE1_PLAN.md** - Phase 1の詳細計画
- **PHASE2_PLAN.md** - Phase 2の詳細計画
- **PHASE3_PLAN.md** - Phase 3の詳細計画
- **README.md** - プロジェクト概要とセットアップ
- **samples/README.md** - サンプルファイルの説明

### 移行元プロジェクト

- **vscode-kubernetes-tools-argo/** - git submodule、参照自由
- **vscode-kubernetes-tools-argo/LSP_MIGRATION_PLAN.md** - 全体移行計画

### 外部リソース

- [Language Server Protocol 仕様](https://microsoft.github.io/language-server-protocol/)
- [vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node)
- [Bun ドキュメント](https://bun.sh/docs)
- [Biome ドキュメント](https://biomejs.dev/)
- [Argo Workflows](https://argoproj.github.io/argo-workflows/)

---

## トラブルシューティング

### ビルドエラー

```bash
# 依存関係を再インストール
rm -rf node_modules packages/*/node_modules
bun install

# キャッシュをクリア
bun run clean
bun run build
```

### テスト失敗

```bash
# 特定のテストファイルのみ実行
bun test packages/server/test/providers/definitionProvider.test.ts

# 詳細ログ付きで実行
bun test --verbose
```

### LSPが動作しない

1. **サーバーログを確認**
   - VSCode: デバッグコンソール
   - Neovim: `:LspLog`

2. **サーバーが起動しているか確認**
   - VSCode: Output > Argo Workflows LSP
   - Neovim: `:LspInfo`

3. **ビルド成果物が存在するか確認**
   ```bash
   ls -la packages/server/dist/server.js
   ```

---

## 開発のヒント

### テストの書き方

```typescript
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';

describe('MyFeature', () => {
  it('should do something', () => {
    const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, 'content');
    const position = Position.create(0, 0);

    // テストロジック
    expect(result).toBeDefined();
  });
});
```

### VSCode API依存の回避

```typescript
// ❌ VSCode API（使用禁止）
import * as vscode from 'vscode';
const uri = vscode.Uri.file('/path/to/file');
const range = new vscode.Range(0, 0, 1, 10);

// ✅ LSP標準型（使用推奨）
import { Range, Position } from 'vscode-languageserver-types';
import { filePathToUri } from '@/utils/uriUtils';

const uri = filePathToUri('/path/to/file');
const range = Range.create(Position.create(0, 0), Position.create(1, 10));
```

### パフォーマンス最適化

- インデックス構築は非同期で実行
- キャッシュを活用（例: `clearChartYamlCache()`）
- 大量ファイルでも高速に動作するよう配慮

---

## FAQ

**Q: Phase 2で実装した機能は何ですか？**

A: Definition Provider（定義へのジャンプ）機能です。templateRef参照からWorkflowTemplate/ClusterWorkflowTemplateの定義へジャンプできます。

**Q: VSCodeとNeovim以外のエディタでも動作しますか？**

A: はい。LSP標準プロトコルに準拠しているため、LSPクライアントを持つ任意のエディタで動作します（Emacs、Vim、Visual Studio等）。

**Q: テストはどのように実行しますか？**

A: `bun run test` を実行してください。116個のテストが実行され、すべて通過するはずです。

**Q: 新機能を追加する場合、どこから始めればよいですか？**

A: `PHASE3_PLAN.md` を確認してください。Phase 3.1（Hover Provider）から実装することを推奨します。

**Q: エディタ非依存性はどのように検証されていますか？**

A: ESLintで静的解析、テストで動作確認、VSCodeとNeovim両方での実機確認を実施しています。
