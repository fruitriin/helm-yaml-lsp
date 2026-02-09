# Changelog

Helm YAML LSP の開発履歴。各バージョンは Phase に対応。

## [0.18.1] - VSCode拡張機能ビルド修正

- VSCode拡張機能のビルド修正
- CI/CDパイプラインの修正
- リリース手順の改善
- 計画ファイルの整理（plans/ディレクトリへ移動）

## [0.18.0] - Phase 18: ArgoTemplateIndex キャッシュ最適化

- RenderedArgoIndexCache の差分更新パスの計算量・アロケーション削減
- ArgoTemplateIndex への逆引きインデックス追加（`removeFile` を O(1) に）
- TextDocument 受け取りオーバーロードで二重作成を排除
- dirty テンプレートの並列レンダリング（`Promise.all`）
- CompletionProvider のダミー ArgoTemplateIndex を排除

## [0.17.0] - Phase 17: values.yaml バリエーション診断

- Chart.yaml 内の `# @lsp` アノテーションで `--set` / `--values` を指定し複数環境を検証
- HelmTemplateExecutor の `buildCommand()` で引数構築
- RenderedArgoIndexCache / SymbolMappingIndex への overrides 伝播
- 追加 values ファイル変更の自動監視

## [0.16.0] - Phase 16: 差分レンダリング

- テンプレート変更時の部分再レンダリング実装
- per-template キャッシュの分離（`clearTemplateCache()` 追加）
- RenderedArgoIndexCache の dirty set 管理
- `renderSingleTemplate()` による高速な差分更新

## [0.15.0] - Phase 15: レンダリング済み YAML の Definition/Hover 統合

- レンダリング済み YAML の Definition/Hover を argoRegistry 経由で処理
- `registry.detectAndResolve()` を definitionProvider / hoverProvider で試行
- Argo 参照の意味的解決（テンプレート定義、パラメータ型等）
- フォールバック機構で symbolMapping に代替

## [0.14.1] - Phase 14B: Semantic Tokens

- LSP `textDocument/semanticTokens` によるエディタ非依存の構文ハイライト
- `{{ }}` 内の Go template 式トークン化（キーワード・関数・変数・プロパティ）
- 既存パーサー（helmFunctionFeatures、valuesReferenceFeatures 等）を再利用
- 段階的リリース戦略（キーワード/演算子 → 意味的強化）

## [0.14.0] - Phase 14: `.tpl` ファイルサポート + Go template Hover/Completion

- `.tpl` ファイルを Helm テンプレートと同等に扱う言語認識
- Go template キーワード（if, range, with, define, block, end）の Hover/Completion
- `helm-language-configuration.json` の改善（コメント・括弧・インデント）

## [0.13.0] - Phase 13: Helm Rendering 診断パイプライン

- Helm テンプレート内 Argo Workflow YAML に対するレンダリング後診断
- helm CLI を使った自動レンダリングと一時 ArgoTemplateIndex の構築
- レンダリング済み診断位置の逆マッピング（信頼度スコア付き）

## [0.12.0] - Phase 12: サンプルディレクトリ全面刷新

- LSP 全機能を網羅するサンプル YAML の新規作成
- Plain YAML 版サンプル（15+ ファイル）：基本構文・データフロー・変数・ConfigMap・リソース種別
- Helm Chart 版サンプル（Chart.yaml + values.yaml + templates/）
- 統合テスト基盤の新規作成（機能カタログ + 診断テスト）

## [0.11.0] - Phase 11: Document Symbols / Document Highlight

- DocumentSymbolProvider：YAML キーとテンプレート構造の階層表示（アウトライン）
- DocumentHighlightProvider：`{{if/range/with/define}}...{{end}}` の対応タグハイライト

## [0.10.0] - Phase 10: Item 変数サポート

- `{{item}}` と `{{item.xxx}}` の検出・定義ジャンプ・ホバー・補完
- withItems / withParam ソースの検出
- item プロパティの補完（オブジェクト配列の場合）

## [0.9.0] - Phase 9: Script Result & Workflow Outputs

- `{{steps.xxx.outputs.result}}` / `{{tasks.xxx.outputs.result}}` のサポート
- `{{workflow.outputs.parameters.xxx}}` / `{{workflow.outputs.artifacts.xxx}}` のサポート
- ホバー時に言語・テンプレート情報を表示

## [0.8.0] - Phase 8: Artifact 参照サポート

- `{{inputs.artifacts.xxx}}` / `{{outputs.artifacts.xxx}}` の検出・定義ジャンプ・ホバー・補完・診断
- `{{steps.xxx.outputs.artifacts.yyy}}` / `{{tasks.xxx.outputs.artifacts.yyy}}` のサポート
- アーティファクト定義の検索と位置マッピング

## [0.7.0] - Phase 7: Helm Template Rendering Awareness

- `helm template` で展開された YAML に対する LSP 機能（Definition/Hover）の提供
- 元テンプレートと展開後 YAML のシンボルマッピング（行ベース・トークンベース）
- Helm テンプレート展開と一時ファイル保存

## [0.6.0] - Phase 6: IntelliJ Plugin Support

- IntelliJ Platform 標準 LSP API（`com.intellij.platform.lsp.api`）を使用したプラグイン実装
- 外部依存ゼロ（LSP4IJ ライブラリ不要）
- サーバーパス自動検出（5 段階の優先順位）
- ファイル判定ロジック（Argo Workflows / Helm テンプレート / ConfigMap・Secret）
- Settings UI の実装

## [0.5.0] - Phase 5: ConfigMap/Secret サポート

- ConfigMap/Secret 定義の検出とインデックス化
- 5 種類の参照パターン対応（configMapKeyRef / secretKeyRef / configMapRef / secretRef / volume）
- name 参照から定義へのジャンプ、key 参照から data キーへのジャンプ
- ホバー情報（マルチライン値の 3 行プレビュー）、補完、診断

## [0.4.0] - Phase 4: Helm 機能のサポート

- Helm Chart 構造の自動検出（Chart.yaml + values.yaml + templates/）
- values.yaml 解析とインデックス化（型推論・コメント抽出・ネスト値のフラット化）
- `.Values` 参照の Definition/Hover/Completion/Diagnostics
- `{{ include "name" . }}` / `{{ template "name" . }}` のサポート
- `_helpers.tpl` ファイルのサポート

## [0.3.0] - Phase 3: Hover / Completion / Diagnostics

- Hover Provider：テンプレート参照・パラメータ参照・Workflow 変数のホバー情報表示
- Completion Provider：テンプレート名・パラメータ名・Workflow 変数の入力補完
- Diagnostic Provider：存在しないテンプレート参照・パラメータ参照のエラー検出
- パラメータ機能（inputs.parameters / outputs.parameters）の定義抽出と参照解決
- Workflow 変数（workflow.name, workflow.namespace 等 8 種類）のサポート

## [0.2.0] - Phase 2: コア機能移植（Definition Provider）

- LSP `textDocument/definition` の実装 — テンプレート参照から定義へのジャンプ
- 型定義の移行（VSCode API → LSP 標準型）
- URI 処理ユーティリティ（Node.js 標準のみ使用、`vscode-uri` 削除）
- ファイルシステム操作（`fast-glob` 導入）
- YAMLテキストベースパーサー（YAML パーサー非依存）
- ArgoTemplateIndex によるワークスペース全体のインデックス化
- ファイル監視（LSP 標準 `workspace/didChangeWatchedFiles`）

## [0.1.0] - Phase 1: プロジェクト構造セットアップ

- モノレポ構造の作成（bun workspaces）
- LSP サーバー（packages/server）のボイラープレート実装
- VSCode クライアント（packages/vscode-client）の実装
- Neovim クライアント（packages/nvim-client）の実装
- ビルドシステムの構築（bun build）
- Biome によるコード品質チェック（lint + format）
- テストインフラの構築（bun test）
- CI/CD 準備（GitHub Actions）
- エディタ非依存性の検証（ESLint で `vscode` パッケージ使用を禁止）

---

Contributors: 果物リン(FruitRiin), Claude Sonnet 4.5, Claude Opus 4.6
