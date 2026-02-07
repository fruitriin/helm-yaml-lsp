# Helm YAML LSP - Claude Code ガイド

このプロジェクトは、Helm内に書かれたArgo Workflows YAMLに対してLSP（Language Server Protocol）を提供することを目的とする。

**最終更新**: 2026-02-07
**現在のステータス**: Phase 1〜11 完了 ✅（722テスト）、Phase 6.1〜6.3 完了

---

## プロジェクト概要

### 目的

VSCode拡張機能から独立したLSPサーバーとして、Argo Workflows、Helm、Kubernetes YAMLファイルに対する高度な編集支援機能を提供する。

### 対象エディタ

- **VSCode** - 主要ターゲット（実装済み）
- **Neovim** - nvim-lspconfig経由で動作確認済み
- **IntelliJ IDEA / JetBrains製品** - Phase 6で実装中（基本実装完了）
- **その他のLSPクライアント** - LSP標準プロトコルに準拠した任意のエディタ

### 実装済みLSP Capability

| LSP Method | 機能 | Phase |
|-----------|------|-------|
| `textDocument/definition` | 定義へ移動 | 2 |
| `textDocument/hover` | ホバー情報 | 3 |
| `textDocument/completion` | 入力補完 | 3 |
| `textDocument/publishDiagnostics` | エラー検出 | 3 |
| `textDocument/documentSymbol` | アウトライン表示 | 11 |
| `textDocument/documentHighlight` | ブロックハイライト | 11 |
| `workspace/didChangeWatchedFiles` | ファイル監視 | 2 |

### 実装済み機能一覧

#### Argo Workflows（Phase 2-3, 8-10）

- テンプレート参照（direct / templateRef / clusterScope）→ 定義ジャンプ、ホバー、補完、診断
- パラメータ参照（`inputs/outputs.parameters`, `steps/tasks.outputs.parameters`）→ 全機能
- Artifact参照（`inputs/outputs.artifacts`, `steps/tasks.outputs.artifacts`）→ 全機能
- Script Result（`steps/tasks.outputs.result`）→ 定義ジャンプ、ホバー（言語検出付き）
- Workflow変数（`workflow.name`, `workflow.parameters.xxx`, `workflow.outputs.parameters/artifacts.xxx` 等）
- Item変数（`{{item}}`, `{{item.xxx}}`）→ withItems/withParam ソース検出、プロパティ補完

#### Helm（Phase 4, 7, 11）

- `.Values.xxx` → values.yamlへの定義ジャンプ、ホバー、補完、診断
- `include`/`template` 関数 → `define` ブロックへのジャンプ、補完
- 組み込み関数（70+）→ ホバー（シグネチャ、使用例）、補完
- `.Chart.*` 変数（13種） → Chart.yamlへのジャンプ
- `.Release.*` / `.Capabilities.*` 変数 → ホバー、補完
- Helmテンプレートレンダリング → `helm template` 出力からオリジナルへのマッピング
- Document Symbol → YAMLアウトライン（マルチドキュメント対応）
- Document Highlight → Helmブロックマッチング（if/else/range/with/define/end）

#### ConfigMap/Secret（Phase 5）

- `configMapKeyRef` / `secretKeyRef` / `configMapRef` / `secretRef` / `volumeConfigMap` / `volumeSecret`
- name参照 → ConfigMap/Secret定義へジャンプ、key参照 → dataキーへジャンプ
- ホバー（値プレビュー、Secret は `[hidden]`）、補完、診断

---

## 絶対に守るべき原則

### 1. サーバーコアはエディタ非依存

- ❌ VSCode API (`vscode.*`) を一切使用しない
- ✅ Node.js標準ライブラリとエディタ非依存のnpmパッケージのみ使用
- ✅ LSP標準プロトコル (`vscode-languageserver`) のみに依存

**検証方法**:
```bash
# サーバー単体テスト
bun run test
```

### 2. 純粋なLSP実装

- すべての機能をLSPプロトコルの標準メッセージで実装
- カスタムプロトコル拡張は最小限に抑える
- クライアント側の実装は薄いラッパーに留める

**実装されているLSP機能**: 上記「実装済みLSP Capability」テーブルを参照

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
│   │   ├── src/                     # ソース（58ファイル）
│   │   │   ├── server.ts            # エントリポイント
│   │   │   ├── types/
│   │   │   │   ├── argo.ts          # Argo型定義（LSP標準型）
│   │   │   │   ├── index.ts         # サーバー設定型
│   │   │   │   └── rendering.ts     # レンダリング型（Phase 7）
│   │   │   ├── utils/
│   │   │   │   ├── uriUtils.ts      # URI処理（Node.js標準）
│   │   │   │   ├── fileSystem.ts    # ファイル操作（fast-glob）
│   │   │   │   └── logger.ts        # ロガー
│   │   │   ├── features/            # 参照検出・YAML解析ロジック（21ファイル）
│   │   │   │   ├── parameterFeatures.ts      # パラメータ/artifact/result検出
│   │   │   │   ├── templateFeatures.ts       # テンプレート定義検出
│   │   │   │   ├── workflowVariables.ts      # Workflow変数検出
│   │   │   │   ├── itemVariableFeatures.ts   # Item変数検出（Phase 10）
│   │   │   │   ├── symbolMapping.ts          # レンダリングマッピング（Phase 7）
│   │   │   │   ├── renderedYamlDetection.ts  # レンダリング済みYAML検出（Phase 7）
│   │   │   │   └── ...                       # 他: configMap, helm, chart, release等
│   │   │   ├── services/            # インデックス・データ管理（8ファイル）
│   │   │   │   ├── argoTemplateIndex.ts      # テンプレートインデックス
│   │   │   │   ├── configMapIndex.ts         # ConfigMap/Secretインデックス
│   │   │   │   ├── helmChartIndex.ts         # Helmチャートインデックス
│   │   │   │   ├── symbolMappingIndex.ts     # レンダリングマッピング（Phase 7）
│   │   │   │   └── ...                       # 他: valuesIndex, fileWatcher等
│   │   │   ├── providers/           # LSPリクエストハンドラー（6ファイル）
│   │   │   │   ├── definitionProvider.ts
│   │   │   │   ├── hoverProvider.ts
│   │   │   │   ├── completionProvider.ts
│   │   │   │   ├── diagnosticProvider.ts
│   │   │   │   ├── documentSymbolProvider.ts   # Phase 11
│   │   │   │   └── documentHighlightProvider.ts # Phase 11
│   │   │   └── references/          # 統一参照解決アーキテクチャ（14ファイル）
│   │   │       ├── types.ts          # 共通型（ReferenceKind, DetectedReference等）
│   │   │       ├── registry.ts       # ガード付きハンドラーレジストリ
│   │   │       ├── setup.ts          # ハンドラー登録
│   │   │       ├── handler.ts        # ReferenceHandler インターフェース
│   │   │       └── handlers/         # 10種のハンドラー実装
│   │   ├── test/                    # テスト（49ファイル, 722 tests）
│   │   └── dist/                    # ビルド成果物
│   ├── vscode-client/               # VSCode拡張
│   ├── nvim-client/                 # Neovim拡張
│   └── intellij-client/             # IntelliJ Plugin（Phase 6）
├── samples/                         # テスト用サンプル
│   ├── argo/                        # Plain YAML版（11ファイル）
│   └── helm/                        # Helm版
├── vscode-kubernetes-tools-argo/    # 移行元プロジェクト（git submodule）
├── PHASE{1..11}_PLAN.md             # 各Phase詳細計画
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
bun run test                # 全テスト実行（722 tests）
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

### 参照機能の追加（ReferenceHandler パターン）

Phase 6以降で確立された統一参照解決アーキテクチャに従う。

**アーキテクチャ概要**:
```
Provider (definition/hover/completion/diagnostic)
  └→ ReferenceRegistry
       └→ Guard (ドキュメント種別判定: helm / configMap / argo)
            └→ ReferenceHandler (detect → resolve → complete → findAll)
```

1. **参照種別の追加手順**:
   - `references/types.ts` に `ReferenceKind` と `Details` 型を追加
   - `features/xxxFeatures.ts` に検出ロジック（正規表現 + 位置判定）を実装
   - `references/handlers/xxxHandler.ts` に `ReferenceHandler` を実装
     - `detect()`: カーソル位置の参照を検出 → `DetectedReference`
     - `resolve()`: 定義位置、ホバーMarkdown、診断メッセージを解決 → `ResolvedReference`
     - `complete()`: 補完候補を返す → `CompletionItem[]`
     - `findAll()`: ドキュメント内の全参照を列挙（診断用）
   - `references/setup.ts` の該当ガードに登録

2. **ガード構成**（`references/setup.ts`）:
   - **Helm ガード**: helmValues, helmTemplate, helmFunction, chartVariable, releaseCapabilities
   - **ConfigMap ガード**: configMap
   - **Argo ガード**: argoTemplate, argoParameter, workflowVariable, itemVariable

3. **既存ハンドラーの拡張**:
   - 新しい参照パターンが既存カテゴリに属する場合、既存ハンドラーを拡張する
   - 例: artifact参照は `argoParameterHandler` の `type` 列挙に追加（Phase 8）
   - 完全に新しい参照種別の場合のみ新規ハンドラーを作成（例: Phase 10の `itemVariableHandler`）

### 新機能の追加（一般）

1. **計画書の確認**: `PHASE{N}_PLAN.md` で実装する機能を確認
2. **実装**: `@/` エイリアス使用、LSP標準型（`Range`, `Position`, `Location`等）
3. **テスト作成**: `bun run test` で確認（`bun test` はサブモジュール走査で不可）
4. **動作確認**: `bun run build` → IDE再起動
5. **コミット**: `bun run check` → コード品質チェック

### 大規模実装のチームオーケストレーション

独立した複数機能を並列実装する場合、チームオーケストレーションが効果的。

**実績**: Phase 8-11を3エージェントで並列実装（Phase 8+9, Phase 10, Phase 11）

**エージェント分割の原則**:
- **共有ファイルがある機能は同一エージェントに**: Phase 8と9は `parameterFeatures.ts`, `argoParameterHandler.ts` を共有するため同一エージェント
- **完全独立な機能は別エージェントに**: Phase 10（新規ハンドラー）、Phase 11（新規プロバイダー）は独立
- **Biome自動修正は最後にまとめて**: `bun run check:write` で全エージェントの出力をフォーマット

### ワークツリーからのポート

`.work/` 配下のgit worktreeで開発した機能をmainにポートする手順:

1. **ファイルコピー**: `cp` で新規/変更ファイルをworktreeからmainへ
2. **型の不整合修正**: mainで進んだ変更（型拡張等）との整合性を確認
3. **既存コードへの統合**: server.ts、providers等の変更はmainの最新状態にマージ
4. **テスト実行**: `bun run test` → `bun run check:write` → 全テストパス確認

**注意**: worktreeとmainで同一ファイルが独立に変更されている場合がある（Phase 7ポート時に `symbolMappingIndex.ts` の戻り値型不一致バグを発見・修正した実績）

### LSP診断バグの修正（テスト先行）

IDEでfalse positive（誤検出）が見つかった場合のワークフロー：

1. **問題の切り分け**
   - `mcp__ide__getDiagnostics` でエラー内容を取得
   - 参照先が実際に存在するか確認 → 存在すればfalse positive
   - 検証スクリプトで関数を直接呼び出し → 正しければビルド未反映、誤りならコードバグ

2. **テスト作成（修正前に必須）**
   - バグを再現する最小限のYAMLでテストケースを追加
   - テスト実行 → **失敗することを確認**

3. **修正**
   - `packages/server/src/features/` のパーサー関数を修正

4. **検証**
   - `bun run test` → 全テスト合格を確認
   - `bun run build` → LSPサーバーをリビルド
   - IDE再起動 → 診断エラーが消えることを確認

5. **複数の独立バグ**
   - チームオーケストレーションで並列修正が効率的
   - 各エージェントが異なるファイルを担当してコンフリクト回避

### YAML解析の既知バグパターン

テキストベースのYAML解析で頻出するバグ：

| パターン | 例 | 修正方法 |
|----------|-----|----------|
| インラインコメント混入 | `name: val  # comment` → `val  # comment` | `stripYamlInlineComment()` で除去 |
| コメント行の誤マッチ | `# {{inputs.parameters.x}}` | `line.trim().startsWith('#')` でスキップ |
| セクション終了誤判定 | コメントが `templates:` と同インデント | `!line.trim().startsWith('#')` 条件追加 |
| 近接参照タイプの混同 | configMapKeyRef と secretKeyRef が隣接 | context-window → 構造的祖先探索に置換 |
| ブロック不完全スキャン | `clusterScope: true` が `template:` の後 | ブロック全体をスキャンするよう拡張 |
| 同名リソースの上書き | 複数ファイルの同名ConfigMap | `Map.set` → キーマージに変更 |

### 統合テストの方針：実ファイルフィクスチャ

統合テスト（`packages/server/test/integration/`）では、**`samples/argo/` 配下の実YAMLファイルをそのままテストフィクスチャとして使用する**。人工的に整形したインラインYAMLは使わない。

#### 原則

1. **フィクスチャは実ファイル**
   - `samples/argo/` のYAMLファイルを依存クラスタ単位でtempDirにコピーし、Index初期化 → Diagnostics実行 → エラー0件をアサート
   - テストを通すためにフィクスチャにPaddingやスペースを挿入してはならない

2. **テスト失敗時はコードを修正する（フィクスチャを修正しない）**
   - テストが失敗した場合、それはLSPのパーサーやインデックスにバグがあることを意味する
   - **テストを通すためにフィクスチャ（サンプルYAML）を改変してはならない**
   - サンプルYAML自体が不正である可能性はあるが、その判断と修正はユーザーが行う

3. **依存クラスタ**
   - ファイル間の参照（templateRef、configMapKeyRef等）が解決できるよう、関連ファイルをまとめてテストする
   - 例: `workflow-templateref.yaml` は `workflow-template.yaml` + `cluster-workflow-template.yaml` と同一ディレクトリに配置

4. **意図的エラーファイルは分離**
   - `demo-workflow-invalid.yaml` のような意図的エラーファイルは別のテストセクションで「N件のエラーを期待」としてテスト

#### テスト構造の例

```typescript
describe('Real Sample Files - Zero False Positives', () => {
  it('Cluster: templateRef + clusterScope', async () => {
    // workflow-template.yaml + cluster-workflow-template.yaml + workflow-templateref.yaml
    const diags = await runDiagnosticsOnCluster([...files]);
    expect(diags).toHaveLength(0);
  });

  it('Cluster: ConfigMap/Secret references', async () => {
    // configmap-data.yaml + workflow-configmap.yaml
    const diags = await runDiagnosticsOnCluster([...files]);
    expect(diags).toHaveLength(0);
  });
});
```

### フェーズ完了時のレビュー

各フェーズ完了時に以下を確認：

- [ ] すべてのテストが通過している
- [ ] `bun run check` が成功している
- [ ] VSCodeとNeovimで動作確認済み
- [ ] progress.mdに進捗を記録
- [ ] コードがシンプルに保たれている

---

## Phase完了状況

| Phase | 内容 | テスト数 | 状態 |
|-------|------|---------|------|
| 1 | プロジェクト構造・ビルドシステム | - | ✅ |
| 2 | コア機能移植（Definition Provider） | 116 | ✅ |
| 3 | Hover/Completion/Diagnostic Provider | 173 | ✅ |
| 4 | Helm機能（Values, Functions, Chart, Release） | 426 | ✅ |
| 5 | ConfigMap/Secret サポート | 440 | ✅ |
| 6 | IntelliJ Plugin（6.1〜6.3完了） | - | 🔨 |
| 7 | Helm Template Rendering（symbolMapping） | 596→722 | ✅ |
| 8 | Artifact参照 | 596 | ✅ |
| 9 | Script Result + workflow.outputs | 596 | ✅ |
| 10 | Item変数（`{{item}}`/`{{item.xxx}}`） | 596 | ✅ |
| 11 | Document Symbol + Document Highlight | 596 | ✅ |

**現在のテスト数**: 722 pass, 1 skip, 0 fail（49テストファイル）

### 各Phaseの詳細

各 `PHASE{N}_PLAN.md` に詳細な設計・実装計画を記載。

### Phase 6: IntelliJ Plugin（部分完了）

- Phase 6.1〜6.3: IntelliJ Platform標準LSP API使用、外部依存ゼロ、Kotlin 402行
- Phase 6.4〜6.6: ビルド・テスト・公開（未完了、Gradleインストールが必要）

### Phase 7: Helm Template Rendering

`helm template` の出力（レンダリング済みYAML）からオリジナルのHelmテンプレートへの逆マッピング。

- **3段階ハイブリッドアルゴリズム**: Structural Anchoring → Value Matching → Fuzzy Matching
- **`# Source:` コメント**: `helm template` 出力内のコメントからオリジナルファイルを特定
- **新規ファイル**: 6 src + 6 test（rendering.ts, renderedYamlDetection, renderedYamlParser, symbolMapping, helmTemplateExecutor, symbolMappingIndex）

### Phase 8-9: Artifact参照 + Script Result

既存の `argoParameterHandler` を拡張（新規ハンドラー不要）。
- Artifact: `inputs/outputs.artifacts`, `steps/tasks.outputs.artifacts`
- Result: `steps/tasks.outputs.result`（スクリプト言語自動検出）
- Workflow outputs: `workflow.outputs.parameters/artifacts.xxx`

### Phase 10: Item変数

新規 `ReferenceHandler` として実装。
- `{{item}}` / `{{item.xxx}}` の検出
- `withItems` / `withParam` ソースの特定
- オブジェクト配列のプロパティ補完

### Phase 11: Document Symbol + Document Highlight

2つの新規プロバイダー。
- **DocumentSymbol**: YAMLインデント構造 → アウトライン、Helmタグサニタイズ、マルチドキュメント対応
- **DocumentHighlight**: Helmブロック（if/else/range/with/define/end）のネスト追跡と対応ハイライト

---

## 参考ドキュメント

### プロジェクト内ドキュメント

- **progress.md** - 開発進捗の詳細記録
- **PHASE{1..11}_PLAN.md** - 各Phaseの詳細計画（1〜5, 7〜11完了、6部分完了）
- **PHASE7_RECOMMENDATIONS.md** - Phase 7改善提案
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

A: Phase 11まで完了しています。722個のテストが通過し、Argo Workflows、Helm、ConfigMap/Secret、Helmテンプレートレンダリング、Document Symbol/Highlightのすべての機能が実装されています。Phase 6（IntelliJ Plugin）は6.1〜6.3まで完了。

**Q: テストはどのように実行しますか？**

A: `bun run test` を実行してください（`bun test` ではなく）。722個のテストが47ファイルから実行されます。

**Q: 新しい参照種別を追加するには？**

A: `references/` ディレクトリの統一参照解決アーキテクチャに従います。`types.ts` に型追加 → `features/` に検出ロジック → `handlers/` にハンドラー実装 → `setup.ts` に登録。詳細は「開発フロー > 参照機能の追加」を参照。

**Q: VSCodeとNeovim以外のエディタでも動作しますか？**

A: はい。LSP標準プロトコルに準拠しているため、LSPクライアントを持つ任意のエディタで動作します。IntelliJ Plugin（Phase 6）も基本実装済みです。
