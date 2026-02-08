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

## 現在の LSP 機能カバレッジ

| 機能 | Plain Argo YAML | Helm テンプレート（生） | Helm テンプレート（レンダリング経由） |
|------|:---:|:---:|:---:|
| Definition | ✅ | ✅ Helm ハンドラー | ✅ SymbolMappingIndex |
| Hover | ✅ | ✅ Helm ハンドラー | ✅ SymbolMappingIndex |
| Completion | ✅ | ✅ Helm ハンドラー | - |
| **Diagnostic** | ✅ | ✅ Helm ハンドラー | **✅ Phase 13** |
| DocumentSymbol | ✅ | ✅ | - |
| DocumentHighlight | ✅ | ✅ | - |

---

## 今後の候補

| Phase | 内容 | 状態 |
|-------|------|------|
| **14** | `.tpl` ファイルサポート + Go template Hover/Completion | **✅ 完了** |
| **14B** | Semantic Tokens（エディタ非依存構文ハイライト） | 計画済み |
| 15 | レンダリング済み YAML の Definition/Hover を argoRegistry 経由に統合 | - |
| 16 | 差分レンダリング（変更テンプレートのみ再レンダリング） | - |
| 17 | values.yaml バリエーション診断（`--set`, `--values`） | - |
| 18 | 一時 ArgoTemplateIndex のキャッシュ最適化 | - |
