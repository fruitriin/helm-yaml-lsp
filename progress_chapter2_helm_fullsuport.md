# Chapter 2: Helm Full Support — 進捗

**目標**: Helm テンプレート内の Argo Workflow に対して、全 LSP 機能をフルサポートする

---

## Phase 12: Helm ファイル判定ロジック向上 ✅

**完了日**: 2026-02-08

### 概要

Helm テンプレートとして認識すべきファイルの判定精度を向上。
Argo/ConfigMap ガードが Helm テンプレートに誤って適用されないようガード条件を修正。

### 主な変更

- `isHelmTemplate()` の判定ロジック改善
- `setup.ts` の Argo/ConfigMap ガードに `!isHelmTemplate(doc)` 条件追加
- Helm テンプレートに対する誤診断（Argo パラメータ等）の排除

---

## Phase 13: Argo Workflow in Helm Template — 診断パイプライン ✅

**完了日**: 2026-02-08

### 概要

Helm テンプレート内の Argo Workflow に対して、`helm template` でレンダリングした後の YAML で Argo/ConfigMap 診断を実行し、結果を元テンプレートの位置にマッピングして返す診断パイプラインを実装。

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `references/setup.ts` | `createArgoOnlyRegistry()` ファクトリ関数追加 |
| `providers/diagnosticProvider.ts` | レンダリング済み YAML 診断パイプライン実装 |
| `services/argoTemplateIndex.ts` | `indexDocument()` メソッド追加 |
| `server.ts` | DiagnosticProvider 初期化更新 |

### 新規テスト

| ファイル | テスト数 | 内容 |
|---------|---------|------|
| `test/providers/diagnosticProvider-helm-rendered.test.ts` | 8 | ユニットテスト（モック使用） |
| `test/integration/helm-argo.test.ts` (拡張) | 17 | 統合テスト（samples/helm/ 実ファイル） |

### テスト結果

**766 pass, 1 skip, 0 fail**（49ファイル）

### アーキテクチャ

```
DiagnosticProvider.provideDiagnostics(helmTemplateDoc)
├─ Step 1: Helm ハンドラー診断（.Values, include 等）
├─ Step 2: helm CLI 可用性チェック → NO → Step 1 のみ返す
├─ Step 3: chartDir 解決
├─ Step 4: renderChart() で Chart 全体をレンダリング
├─ Step 5: 一時 ArgoTemplateIndex 構築（templateRef 相互参照解決用）
├─ Step 6: argoOnlyRegistry で Argo/ConfigMap 診断
├─ Step 7: symbolMappingIndex で位置マッピング + confidence フィルタ
└─ Step 8: Helm 診断 + マッピング済み Argo 診断をマージして返す
```

### 計画からの変更点

1. **`renderSingleTemplate` → `renderChart`**: templateRef が別テンプレートの WorkflowTemplate を参照するため、Chart 全体のレンダリングが必要
2. **一時 ArgoTemplateIndex 構築**: `indexDocument()` を新設し、レンダリング済みコンテンツをメモリ上で直接インデックス
3. **外部 argoRegistry 注入 → 内部生成**: レンダリング毎に ArgoTemplateIndex が変わるため、`provideRenderedDiagnostics()` 内で毎回生成

### confidence による severity 制御

| confidence | severity |
|-----------|----------|
| >= 0.8 | Error |
| 0.5 - 0.8 | Warning |
| < 0.5 | 除外（false positive リスク） |

---

## Phase 14: `.tpl` ファイルサポート + language-configuration 改善 + Go template Hover/Completion ✅

**完了日**: 2026-02-08

### 概要

Helm チャートの `.tpl` ファイルを LSP のフルサポート対象に追加。
Go テンプレート制御構文（`if`, `range`, `with`, `define`, `block`, `end` 等）に Hover / Completion を提供。
`helm-language-configuration.json` を全面改善し、ブロックコメントや `{{-`/`-}}` ブラケットを追加。

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `vscode-client/package.json` | `extensions: [".tpl"]` 追加 |
| `vscode-client/src/extension.ts` | fileEvents に `.tpl` 追加 |
| `vscode-client/helm-language-configuration.json` | blockComment, `{{-`/`-}}` ブラケット4バリエーション, backtick 等を全面改善 |
| `features/goTemplateKeywords.ts` | **新規** — 9キーワードカタログ（if, else, else if, range, with, define, template, block, end） |
| `features/goTemplateKeywordFeatures.ts` | **新規** — カーソル位置のキーワード検出ロジック |
| `references/types.ts` | `ReferenceKind` に `goTemplateKeyword` 追加、`GoTemplateKeywordDetails` 型追加 |
| `references/handlers/goTemplateKeywordHandler.ts` | **新規** — Hover / Completion ハンドラー |
| `references/setup.ts` | Helm ガードの最低優先順位に goTemplateKeywordHandler 登録 |

### 新規テスト

| ファイル | テスト数 | 内容 |
|---------|---------|------|
| `test/features/goTemplateKeywords.test.ts` | 5 | カタログ網羅性・検索テスト |
| `test/references/goTemplateKeywordHandler.test.ts` | 13 | detect / resolve / complete テスト |

### テスト結果

**788 pass, 1 skip, 0 fail**（51ファイル）

---

## Phase 14B: Semantic Tokens — エディタ非依存構文ハイライト ✅

**完了日**: 2026-02-08

### 概要

LSP の `textDocument/semanticTokens` を実装し、Helm テンプレート内の Go template 式（`{{ }}` 内）をエディタ非依存でハイライト。VSCode・Neovim・Emacs 等すべての LSP クライアントで動作する。TextMate グラマーは VSCode 固有のため不採用。

### トークンタイプ

| Index | tokenType | 対象 | 例 |
|-------|-----------|------|-----|
| 0 | `keyword` | Go template 制御構文 | `if`, `range`, `with`, `define`, `block`, `end`, `else`, `template` |
| 1 | `function` | Sprig/Helm 関数 (+`defaultLibrary`) | `quote`, `default`, `toYaml`, `include` |
| 2 | `variable` | テンプレート変数 | `$var`, `$key`, `$val` |
| 3 | `property` | ドットアクセス値 | `.Values.image.tag`, `.Release.Name` |
| 4 | `string` | 文字列リテラル | `"mychart.labels"` |
| 5 | `number` | 数値リテラル | `42`, `3.14` |
| 6 | `comment` | テンプレートコメント | `/* comment */` |
| 7 | `operator` | 括弧・パイプ・代入 | `{{`, `}}`, `|`, `:=` |

### トークン修飾子

| Bit | modifier | 用途 |
|-----|----------|------|
| 0 | `definition` | `{{ define "name" }}` の名前部分（将来拡張用） |
| 1 | `readonly` | `.Release.*`, `.Capabilities.*` |
| 2 | `defaultLibrary` | Sprig 組み込み関数 |

### 新規ファイル

| ファイル | 内容 |
|---------|------|
| `features/goTemplateTokenizer.ts` | `{{ }}` ブロックのトークナイザー（100+ Sprig/Helm 関数対応） |
| `providers/semanticTokensProvider.ts` | SemanticTokensProvider（full + range 対応） |
| `test/features/goTemplateTokenizer.test.ts` | トークナイザーテスト（22ケース） |
| `test/providers/semanticTokensProvider.test.ts` | Provider統合テスト（5ケース） |

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `server.ts` | `semanticTokensProvider` capability 登録 + `on` / `onRange` ハンドラー |

### アーキテクチャ

```
connection.languages.semanticTokens.on(params)
└─ SemanticTokensProvider.provideDocumentSemanticTokens(doc)
   ├─ isHelmTemplate(doc) → false → 空トークン返却
   └─ tokenizeGoTemplateExpressions(doc)
      ├─ 行ごとに {{ }} ブロック検出（BLOCK_RE）
      ├─ ブロック内トークン分類（優先順序: コメント→文字列→演算子→変数→プロパティ→キーワード→関数→数値）
      └─ TokenSpan[] をソートして SemanticTokensBuilder に push
```

### テスト結果

**820 pass, 1 skip, 0 fail**（53ファイル）

---

## Phase 14C: Helm テンプレート内 Argo パラメータ参照のホバー/定義 ✅

**完了日**: 2026-02-08

### 概要

Helm テンプレート内の backtick-escaped Argo パラメータ参照（`{{` `` ` ``  `{{steps.run-script.outputs.result}}` `` ` `` `}}`）に対して、ホバーと定義ジャンプが動作するよう修正。ハイフン入りステップ名（`run-script` 等）にも対応。

### 原因

`setup.ts` の Helm ガードに Argo パラメータハンドラーが含まれていなかった。Argo ガードは `!isHelmTemplate(doc)` で除外されるため、Helm テンプレート内の Argo 参照がどのハンドラーにも到達しなかった。

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `references/setup.ts` | Helm ガードに `argoParameterHandler` + `itemVariableHandler` を最低優先度で追加 |

### 新規テスト

| ファイル | テスト数 | 内容 |
|---------|---------|------|
| `test/integration/helm-argo.test.ts` (拡張) | 3 | `{{steps.run-script.outputs.result}}` ホバー・定義、`{{inputs.parameters.output}}` ホバー |

### テスト結果

**823 pass, 1 skip, 0 fail**（53ファイル）

---

## Phase 15: レンダリング済み YAML の Definition/Hover を argoRegistry 経由に統合 ✅

**完了日**: 2026-02-08

### 概要

レンダリング済み YAML（`helm template` 出力）に対する Definition/Hover を、`symbolMappingIndex` による位置マッピングだけでなく、既存の `ReferenceRegistry` の Argo ハンドラーで意味的に解決するよう改善。テンプレート定義ジャンプ、パラメータ型・デフォルト値ホバー等が rendered YAML 上でも動作する。

### 技術的根拠

既存 registry のガードがレンダリング済み YAML にそのままマッチすることを発見:
- `isHelmTemplate()` → false（languageId='yaml'、`/templates/` 外）
- `isArgoWorkflowDocument()` → true（Argo apiVersion/kind あり）
- Argo 式 `{{inputs.parameters.message}}` は `HELM_TEMPLATE_SYNTAX_REGEX` (`/\{\{-?\s/`) にマッチしない（スペースなし）

プロバイダーの短絡処理を変更するだけで、新しいサービスやハンドラーの追加は不要。

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `providers/definitionProvider.ts` | Argo registry 試行 + symbolMapping フォールバック |
| `providers/hoverProvider.ts` | Argo registry 試行 + symbolMapping フォールバック |

### 新規テスト

| ファイル | テスト数 | 内容 |
|---------|---------|------|
| `test/providers/definitionProvider.test.ts` (拡張) | 4 | ローカルテンプレート定義、パラメータ定義、templateRef 定義、フォールバック |
| `test/providers/hoverProvider.test.ts` (拡張) | 5 | テンプレートホバー、パラメータホバー、ワークフロー変数ホバー、templateRef ホバー、フォールバック |

### アーキテクチャ

```
DefinitionProvider / HoverProvider (rendered YAML)
├─ Step 1: registry.detectAndResolve() — Argo 意味解決
│  ├─ argoTemplateHandler → ローカルテンプレート / templateRef 定義
│  ├─ argoParameterHandler → パラメータ定義
│  ├─ workflowVariableHandler → ワークフロー変数
│  └─ itemVariableHandler → Item 変数
├─ Step 2 (フォールバック): symbolMappingIndex
│  ├─ findOriginalHelmExpression() → Helm 式情報
│  └─ findOriginalLocation() → ソース位置マッピング
└─ Step 3: null
```

### テスト結果

**832 pass, 1 skip, 0 fail**（53ファイル）

---

## 現在の LSP 機能カバレッジ

| 機能 | Plain Argo YAML | Helm テンプレート（生） | レンダリング済み YAML |
|------|:---:|:---:|:---:|
| Definition | ✅ | ✅ Helm ハンドラー | **✅ Argo registry + SymbolMapping** |
| Hover | ✅ | ✅ Helm ハンドラー | **✅ Argo registry + SymbolMapping** |
| Completion | ✅ | ✅ Helm ハンドラー | - |
| Diagnostic | ✅ | ✅ Helm ハンドラー | ✅ Phase 13 |
| DocumentSymbol | ✅ | ✅ | - |
| DocumentHighlight | ✅ | ✅ | - |
| SemanticTokens | - | ✅ Phase 14B | - |

---

## 今後の候補

| Phase | 内容 | 状態 |
|-------|------|------|
| **14** | `.tpl` ファイルサポート + Go template Hover/Completion | **✅ 完了** |
| **14B** | Semantic Tokens（エディタ非依存構文ハイライト） | **✅ 完了** |
| **15** | レンダリング済み YAML の Definition/Hover を argoRegistry 経由に統合 | **✅ 完了** |
| 15B | RenderedArgoIndexCache — cross-document templateRef 解決の強化 | 計画済み |
| 16 | 差分レンダリング（変更テンプレートのみ再レンダリング） | - |
| 17 | values.yaml バリエーション診断（`--set`, `--values`） | - |
| 18 | 一時 ArgoTemplateIndex のキャッシュ最適化 | - |
