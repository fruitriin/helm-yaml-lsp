# Helm YAML LSP - Claude Code ガイド

このプロジェクトは、Helm内に書かれたArgo Workflows YAMLに対してLSP（Language Server Protocol）を提供することを目的とする。

**最終更新**: 2026-01-27
**現在のステータス**: Phase 5 完了 ✅、Phase 6.1〜6.3 完了 🔨

---

## プロジェクト概要

### 目的

VSCode拡張機能から独立したLSPサーバーとして、Argo Workflows、Helm、Kubernetes YAMLファイルに対する高度な編集支援機能を提供する。

### 対象エディタ

- **VSCode** - 主要ターゲット（実装済み）
- **Neovim** - nvim-lspconfig経由で動作確認済み
- **IntelliJ IDEA / JetBrains製品** - Phase 6で実装中（基本実装完了）
- **その他のLSPクライアント** - LSP標準プロトコルに準拠した任意のエディタ

### 実装済み機能（Phase 5完了時点）

#### Argo Workflows機能（Phase 2-3）

✅ **Definition Provider（定義へのジャンプ）**
- WorkflowTemplate/ClusterWorkflowTemplateのインデックス化
- templateRef参照から定義へのジャンプ
- パラメータ定義へのジャンプ
- ローカルテンプレート参照のジャンプ
- VSCode: F12キー / Neovim: `gd`キー

✅ **Hover Provider（ホバー情報表示）**
- テンプレート参照のホバー情報
- パラメータ参照のホバー情報
- Workflow変数のホバー情報

✅ **Completion Provider（入力補完）**
- テンプレート名の補完
- パラメータ名の補完（inputs/outputs）
- Workflow変数の補完

✅ **Diagnostic Provider（エラー検出）**
- 存在しないテンプレート参照の検出
- 存在しないパラメータ参照の検出

#### Helm機能（Phase 4）

✅ **Helm Chart検出とインデックス化**
- Chart.yaml自動検出
- values.yaml解析とインデックス化
- templatesディレクトリのスキャン

✅ **.Values参照のサポート**
- `.Values.xxx` 参照の検出
- values.yamlへの定義ジャンプ
- ホバー情報表示（値、型、説明）
- 入力補完
- 存在しない値のエラー検出

✅ **include/template関数のサポート**
- `{{ define }}` ブロックの検出
- `{{ include "name" }}` から定義へのジャンプ
- テンプレート名の補完
- ホバー情報表示

✅ **Helm組み込み関数のサポート（70+ functions）**
- 文字列関数（quote, indent, trim等）
- 型変換関数（toYaml, toJson等）
- リスト/辞書関数（list, dict等）
- 数学関数（add, sub等）
- パイプライン内の関数検出
- ホバー情報（シグネチャ、説明、使用例）
- 関数の入力補完

✅ **.Chart変数のサポート**
- `.Chart.Name`, `.Chart.Version` 等13変数
- Chart.yamlへのジャンプ
- ホバー情報と補完

✅ **.Release/.Capabilities変数のサポート**
- `.Release.Name`, `.Release.Namespace` 等6変数
- `.Capabilities.KubeVersion` 等6変数
- ホバー情報と補完

✅ **エディタ非依存性の実証**
- VSCode API依存ゼロ
- Node.js標準ライブラリのみ使用
- 両エディタで同じLSPサーバーが動作

#### ConfigMap/Secret機能（Phase 5）

✅ **ConfigMap/Secret検出とインデックス化**
- `kind: ConfigMap` / `kind: Secret` の自動検出
- metadata.nameとdataキーのインデックス化
- multilineブロック値のサポート（`|` と `>`）

✅ **ConfigMap/Secret参照のサポート**
- configMapKeyRef / secretKeyRef（env.valueFrom）
- configMapRef / secretRef（envFrom）
- volumeConfigMap / volumeSecret（volumes）
- name参照とkey参照の両方に対応

✅ **Definition Provider統合**
- configMapKeyRef.name → ConfigMap定義へジャンプ
- configMapKeyRef.key → dataキーへジャンプ
- Secret参照も同様にサポート

✅ **Hover Provider統合**
- ConfigMap name: 名前、キー数、キーリスト表示
- ConfigMap key: キー名、値表示（multiline対応）
- Secret: 値を`[hidden]`で隠蔽

✅ **Completion Provider統合**
- ConfigMap/Secret名の入力補完
- dataキーの入力補完

✅ **Diagnostics Provider統合**
- 存在しないConfigMap/Secret参照の検出
- 存在しないキー参照の検出

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
├── PHASE4_PLAN.md                   # Phase 4詳細計画（Helm機能）
├── PHASE5_PLAN.md                   # Phase 5詳細計画（ConfigMap/Secret）
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
bun run test                # 全テスト実行（173 tests）
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
   - `PHASE4_PLAN.md` で実装する機能を確認
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
- テストインフラ整備

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

**動作確認**:
- ✅ VSCodeで定義ジャンプ成功（F12キー）
- ✅ Neovimで定義ジャンプ成功（`gd`キー）

---

## Phase 3: 追加機能の実装 ✅

**実装済み機能**:
1. ✅ **Hover Provider** - テンプレート参照、パラメータ参照、Workflow変数のホバー情報表示
2. ✅ **パラメータ機能** - inputs/outputs.parametersの定義と参照の検出
3. ✅ **Workflow変数** - workflow.name等の8つの組み込み変数サポート
4. ✅ **Completion Provider** - テンプレート名、パラメータ名、Workflow変数の入力補完
5. ✅ **Diagnostic Provider** - 存在しないテンプレート/パラメータ参照の検出
6. ✅ **ローカルテンプレート参照** - 同一ファイル内のテンプレートジャンプ

**テスト結果**: 173 tests passed, 0 fail

**動作確認**:
- ✅ VSCodeで全機能動作確認
- ✅ Neovimで全機能動作確認

詳細は `PHASE3_PLAN.md` および `progress.md` を参照。

---

## Phase 4の完了状況 ✅

Phase 4（Helm機能のサポート）はすべて完了しました：

- ✅ **Phase 4.1**: Helm Chart構造の検出とインデックス化
- ✅ **Phase 4.2**: values.yaml解析とインデックス化
- ✅ **Phase 4.3**: .Values参照のサポート（Definition/Hover/Completion/Diagnostics）
- ✅ **Phase 4.4**: include/template関数のサポート
- ✅ **Phase 4.5**: Helm組み込み関数のサポート（70+ functions）
- ✅ **Phase 4.6**: Chart.yamlサポート（.Chart変数）
- ✅ **Phase 4.7**: Release/Capabilities変数のサポート
- ⏸️ **Phase 4.8**: values.schema.jsonサポート（将来拡張）

**テスト結果**: 426 tests passed（Phase 3の173 testsから+253 tests増加）

詳細は `PHASE4_PLAN.md` を参照。

---

## Phase 5の完了状況 ✅

Phase 5（ConfigMap/Secretサポート）はすべて完了しました：

- ✅ **Phase 5.1**: ConfigMap/Secret検出とインデックス化
- ✅ **Phase 5.2**: ConfigMap/Secret参照の検出（5種類のパターン）
- ✅ **Phase 5.3**: Definition Provider統合
- ✅ **Phase 5.4**: Hover Provider統合（マルチライン値プレビュー対応）
- ✅ **Phase 5.5**: Completion Provider統合
- ✅ **Phase 5.6**: Diagnostics Provider統合

**テスト結果**: 440 tests passed（Phase 4の426 testsから+13 tests増加）

**サポートされる参照パターン**:
- `configMapKeyRef` / `secretKeyRef` (env.valueFrom)
- `configMapRef` / `secretRef` (envFrom)
- `volumeConfigMap` / `volumeSecret` (volumes)

詳細は `PHASE5_PLAN.md` を参照。

---

## Phase 6の進行状況 🔨

### 実装済み機能: IntelliJ Plugin Support（Phase 6.1〜6.3）

Phase 6では、IntelliJ IDEAおよびJetBrains製品向けのプラグインを実装し、より多くの開発者がLSPサーバーを利用できるようにします。

**実装アプローチ**: IntelliJ Platform標準のLSP API使用

✅ **Phase 6.1-6.3完了**:
- ✅ IntelliJ Plugin基本構造のセットアップ
- ✅ LSP統合実装（IntelliJ Platform標準API）
- ✅ サーバーパス自動検出（5段階の優先順位）
- ✅ 設定UI実装
- ✅ プロジェクトライフサイクル管理
- ✅ ドキュメント整備

**技術的特徴**:
- ✅ **外部依存ゼロ**: LSP4IJライブラリ不要
- ✅ **IntelliJ Platform標準API**: `com.intellij.platform.lsp.api`使用
- ✅ **シンプルなビルド**: Gradleの依存関係が最小限
- ✅ **プラグインサイズ削減**: 外部ライブラリをバンドルしない

**実装コード統計**:
- Kotlinファイル: 4ファイル
- Kotlinコード: 402行
- 主要クラス:
  - HelmYamlLspServerSupportProvider.kt: 241行（LSP統合のコア）
  - HelmYamlLspConfigurable.kt: 90行（設定UI）
  - HelmYamlLspSettings.kt: 44行（設定永続化）
  - HelmYamlLspProjectListener.kt: 27行（ライフサイクル）

**未完了（オプション）**:
- ⏸️ **Phase 6.4**: ビルド・パッケージング（Gradleインストールが必要）
- ⏸️ **Phase 6.5**: テストと動作確認
- ⏸️ **Phase 6.6**: JetBrains Marketplace公開準備

**サポート対象IDE**:
- IntelliJ IDEA（Community/Ultimate）
- PyCharm
- WebStorm
- その他JetBrains製品

**次のステップ**:
- Gradleをインストールして `./gradlew build` を実行
- IntelliJ IDEAでプラグインを読み込んで動作確認
- Phase 6.4以降の実装

詳細は `PHASE6_PLAN.md` を参照。

---

## 参考ドキュメント

### プロジェクト内ドキュメント

- **progress.md** - 開発進捗の詳細記録
- **PHASE3_PLAN.md** - Phase 3の詳細計画（完了）
- **PHASE4_PLAN.md** - Phase 4の詳細計画（Helm機能、完了）
- **PHASE5_PLAN.md** - Phase 5の詳細計画（ConfigMap/Secret、完了）
- **PHASE6_PLAN.md** - Phase 6の詳細計画（IntelliJ Plugin）
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

**Q: 現在どのフェーズまで完了していますか？**

A: Phase 5（ConfigMap/Secretサポート）まで完了しています。440個のテストが通過し、Argo Workflows、Helm、ConfigMap/Secretのすべての機能が実装されています。

**Q: Phase 5で実装した機能は何ですか？**

A: ConfigMap/Secret参照の包括的なサポートです。`configMapKeyRef`、`secretKeyRef`、`configMapRef`、`secretRef`、`volumeConfigMap`、`volumeSecret`のすべての参照パターンに対応し、定義ジャンプ、ホバー情報、入力補完、エラー検出を提供します。multilineブロック値もサポートしています。

**Q: VSCodeとNeovim以外のエディタでも動作しますか？**

A: はい。LSP標準プロトコルに準拠しているため、LSPクライアントを持つ任意のエディタで動作します（Emacs、Vim等）。Phase 6ではIntelliJ IDEA/JetBrains製品向けの公式プラグインも実装予定です。

**Q: テストはどのように実行しますか？**

A: `bun run test` を実行してください。440個のテストが実行され、すべて通過するはずです。

**Q: 次に実装する機能は何ですか？**

A: Phase 6でIntelliJ IDEA向けのプラグインを実装予定です。Kotlin/JavaでIntelliJ Pluginを開発し、LSP4IJを使用してLSPサーバーと統合します。詳細は`PHASE6_PLAN.md`を参照してください。

**Q: エディタ非依存性はどのように検証されていますか？**

A: ESLintで静的解析、テストで動作確認、VSCodeとNeovim両方での実機確認を実施しています。
