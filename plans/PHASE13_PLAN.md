# Phase 13: Argo Workflow in Helm Template — 診断パイプライン

## 概要

Helm テンプレート内に記述された Argo Workflow YAML に対して、
`helm template` レンダリング後の YAML で Argo/ConfigMap 診断を適用し、
結果を元テンプレートの位置にマッピングして返す。

**helm CLI がなければ Argo/ConfigMap 診断は停止し、Helm ハンドラーの診断のみ提供する。**

## ステータス: 完了

**テスト結果**: 766 pass, 1 skip, 0 fail（49ファイル）

## 実装前の状態

| 機能 | 生テンプレート | レンダリング済み YAML |
|------|---------------|---------------------|
| Definition | Helm ハンドラー | SymbolMappingIndex → 元へジャンプ |
| Hover | Helm ハンドラー | SymbolMappingIndex → 元の情報表示 |
| **Diagnostic** | **Helm ハンドラーのみ** | **未実装** |

- `setup.ts` で Helm テンプレートに対して Argo/ConfigMap ガードを除外済み（Phase 12 末の修正）
- `HelmTemplateExecutor` / `SymbolMappingIndex` は Phase 7 で実装済み
- Definition/Hover ではレンダリング済み YAML → 元テンプレートの逆引きが動作している
- DiagnosticProvider には `symbolMappingIndex` が渡されていない

## アーキテクチャ（実装後）

```
DiagnosticProvider.provideDiagnostics(helmTemplateDoc)
│
├─ Step 1: Helm ハンドラー診断（既存）
│   └─ registry.validateAll(helmTemplateDoc)
│       └─ Helm ガード → .Values 存在チェック, include 存在チェック等
│
├─ Step 2: helm CLI 利用可能? ← helmTemplateExecutor.isHelmAvailable()
│   │
│   ├─ NO → Step 1 の結果のみ返す（Argo/ConfigMap 診断はスキップ）
│   │
│   └─ YES → Step 3 へ
│
├─ Step 3: chartDir 解決 + テンプレート相対パス計算
│   └─ helmChartIndex.findChartForFile(document.uri)
│
├─ Step 4: Chart 全体をレンダリング ← ★ 計画変更: renderSingleTemplate → renderChart
│   └─ helmTemplateExecutor.renderChart(chartDir)
│       └─ 失敗 → Step 1 の結果のみ返す
│       └─ 現在のテンプレートの rendered content を documents[] から検索
│
├─ Step 5: 一時 ArgoTemplateIndex 構築 ← ★ 計画追加
│   └─ 全レンダリング済みドキュメントを indexDocument() で登録
│       └─ templateRef の相互参照解決に必要
│   └─ createArgoOnlyRegistry(tempArgoIndex, configMapIndex)
│
├─ Step 6: レンダリング済み YAML で Argo/ConfigMap 診断
│   ├─ レンダリング済みテキストから仮 TextDocument を作成
│   ├─ tempArgoRegistry.validateAll(renderedDoc)
│   │   └─ Argo ガード + ConfigMap ガード
│   └─ 検出された failures を収集
│
├─ Step 7: 位置マッピング
│   └─ 各 failure の range を symbolMappingIndex.findOriginalLocation() で
│       レンダリング済み位置 → 元テンプレート位置に変換
│       └─ confidence < 0.5 → 除外
│       └─ confidence 0.5-0.8 → Warning に降格
│       └─ confidence >= 0.8 → Error
│
└─ Step 8: マージして返す
    └─ Step 1 の Helm 診断 + Step 7 のマッピング済み Argo/ConfigMap 診断
```

### 計画からの主要変更点

1. **`renderSingleTemplate` → `renderChart`**: 単一テンプレートのレンダリングでは `templateRef` が参照する別テンプレート（WorkflowTemplate）を解決できない。Chart 全体をレンダリングし、全 WorkflowTemplate を一時インデックスに登録することで解決。`renderChart` にはキャッシュがあるためパフォーマンス影響は最小限。

2. **一時 ArgoTemplateIndex の構築（Step 5 追加）**: `ArgoTemplateIndex.indexDocument()` メソッドを新設。メモリ上のレンダリング済みコンテンツを直接インデックスに追加可能にした。

3. **外部 `argoRegistry` 注入 → 内部生成**: 当初計画ではコンストラクタで `argoRegistry` を外部から注入する設計だったが、レンダリング毎に一時 ArgoTemplateIndex が変わるため、`provideRenderedDiagnostics()` 内部で毎回 `createArgoOnlyRegistry()` を呼ぶ設計に変更。

## 変更対象ファイル（実装後）

### 1. `providers/diagnosticProvider.ts`（主要変更）

**変更後**:

```typescript
class DiagnosticProvider {
  private registry: ReferenceRegistry;             // 既存
  private helmTemplateExecutor?: HelmTemplateExecutor;  // 追加
  private symbolMappingIndex?: SymbolMappingIndex;      // 追加
  private helmChartIndex?: HelmChartIndex;              // 追加（既存だが明示的に保持）
  private configMapIndex?: ConfigMapIndex;              // 追加: argoOnlyRegistry 生成用

  async provideDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
    const directDiagnostics = await this.provideDirectDiagnostics(document);

    if (isHelmTemplate(document) && this.helmTemplateExecutor) {
      const renderedDiagnostics = await this.provideRenderedDiagnostics(document);
      return [...directDiagnostics, ...renderedDiagnostics];
    }

    return directDiagnostics;
  }
}
```

**追加メソッド**:

- `provideDirectDiagnostics(doc)` — 既存ロジックをそのまま抽出
- `provideRenderedDiagnostics(doc)` — Step 2〜8 の新規ロジック

### 2. `references/setup.ts`（小変更）

**追加**: `createArgoOnlyRegistry()` ファクトリ関数

```typescript
export function createArgoOnlyRegistry(
  argoTemplateIndex: ArgoTemplateIndex,
  configMapIndex?: ConfigMapIndex
): ReferenceRegistry {
  // ConfigMap guard（check: () => true）
  // Argo guard（check: isArgoWorkflowDocument — isHelmTemplate チェック不要）
}
```

### 3. `services/argoTemplateIndex.ts`（小変更）

**追加**: `indexDocument()` メソッド

```typescript
indexDocument(uri: string, content: string): void {
  // ファイルI/O不要でメモリ上のコンテンツをインデックスに追加
  // indexFile() と共通の内部メソッド indexDocumentContent() を使用
}
```

### 4. `server.ts`（初期化変更）

```diff
  const diagnosticProvider = new DiagnosticProvider(
    argoTemplateIndex,
    helmChartIndex,
    valuesIndex,
    helmTemplateIndex,
    configMapIndex,
+   undefined,              // registry（デフォルト使用）
+   helmTemplateExecutor,   // 追加
+   symbolMappingIndex,     // 追加
  );
```

### 5. `features/documentDetection.ts`（変更なし）

既存の `isHelmTemplate()` をそのまま使用。

### 6. `services/helmChartIndex.ts`（参照のみ）

`findChartForFile(uri)` でファイルが属するチャートの `chartDir` を取得する。
既にある機能を使用。

## helm CLI 不在時の挙動

```
helm CLI あり                        helm CLI なし
─────────────                        ──────────────
Helm ハンドラー診断: ✅               Helm ハンドラー診断: ✅
  .Values 存在チェック                  .Values 存在チェック
  include/template 存在チェック         include/template 存在チェック
  .Chart.* 検証                        .Chart.* 検証

Argo 診断（レンダリング経由）: ✅     Argo 診断: ❌ スキップ
  テンプレート参照                     （ユーザーに警告メッセージ表示済み）
  パラメータ参照
  変数参照

ConfigMap 診断（レンダリング経由）: ✅  ConfigMap 診断: ❌ スキップ
  name/key 参照
```

## 位置マッピングの精度と閾値

SymbolMappingIndex の `findOriginalLocation()` は confidence スコアを返す。

| confidence | 意味 | 診断への適用 |
|-----------|------|-------------|
| 1.0 | 完全一致行 | Error として適用 |
| 0.8-0.95 | キー名+値マッチ | Error として適用 |
| 0.5-0.8 | Fuzzy マッチ | **Warning に降格して適用** |
| < 0.5 | 推定のみ | **適用しない**（除外） |

## テスト（実装後）

### A. 統合テスト: `test/integration/helm-argo.test.ts`（既存ファイルに追加）

`samples/helm/` の実ファイル群を使用。

#### テストケース: helm CLI あり（条件付き実行）

`helmTemplateExecutor.isHelmAvailable()` が `true` の場合のみ実行。
helm がなければログ出力して skip。

| ファイル | 期待結果 |
|---------|----------|
| `workflow-basic.yaml` | 0 diagnostics |
| `workflow.yaml` | 0 diagnostics |
| `workflow-parameters.yaml` | 0 diagnostics |
| `workflow-template.yaml` | 0 diagnostics |
| `workflow-dag.yaml` | 0 diagnostics |
| `workflow-templateref.yaml` | 0 diagnostics |
| `workflow-artifacts.yaml` | 0 diagnostics |
| `workflow-result.yaml` | 0 diagnostics |
| `workflow-variables.yaml` | 0 diagnostics |
| `workflow-item.yaml` | 0 diagnostics |
| `cron-workflow.yaml` | 0 diagnostics |
| `configmap-helm.yaml` | 0 diagnostics |

#### テストケース: helm CLI なし（常時実行）

HelmTemplateExecutor をモック（`isHelmAvailable() = false`）。

- `workflow-basic.yaml`: Argo テンプレート参照エラーが出ないこと
- `workflow-parameters.yaml`: .Values 関連の Argo false positive が出ないこと

#### テストケース: false-positive 検証

- `{{ .Values.xxx }}` が Argo パラメータとして誤検出されない
- Helm 制御構文が diagnostic にならない
- `{{ include "..." }}` が Argo テンプレート参照として誤検出されない

### B. ユニットテスト: `test/providers/diagnosticProvider-helm-rendered.test.ts`（新規）

| テストケース | 内容 |
|-------------|------|
| Helm テンプレート + helm CLI あり | レンダリング後に Argo 診断が走り、元位置にマッピングされる |
| templateRef 相互参照解決 | Chart 全体の WorkflowTemplate がインデックスされ templateRef が解決される |
| Helm テンプレート + helm CLI なし | Helm ハンドラー診断のみ返る |
| レンダリング失敗 | Helm ハンドラー診断のみ返る |
| 位置マッピング失敗（低 confidence < 0.5） | その diagnostic が除外される |
| 中 confidence（0.5-0.8） | Warning に降格される |
| 非 Helm ファイル | 従来通り Argo ガードが直接動作 |
| helmTemplateExecutor なし | レンダリング診断がスキップされる |

### 既存テストへの影響

- DiagnosticProvider のコンストラクタ引数が増えたが、追加引数はすべてオプショナル
- 既存テストは変更不要（後方互換性維持）

## 実装手順（実施済み）

1. `setup.ts` に `createArgoOnlyRegistry()` ファクトリ関数を追加
2. `argoTemplateIndex.ts` に `indexDocument()` メソッドを追加
3. `diagnosticProvider.ts` を拡張
   - コンストラクタに `helmTemplateExecutor`, `symbolMappingIndex`, `configMapIndex` を追加（オプショナル）
   - `provideDirectDiagnostics()` で既存ロジックを抽出
   - `provideRenderedDiagnostics()` メソッドを実装（renderChart + 一時インデックス方式）
4. `server.ts` の初期化を更新（追加引数を渡す）
5. ユニットテスト作成（helm CLI モック使用）
6. 統合テスト拡張（`samples/helm/` 実ファイル使用、helm CLI 条件付き）
7. **全テストパス確認: `bun run test` で 766 pass, 1 skip, 0 fail**
8. `bun run check:write` で整形

## 将来の拡張

- **レンダリング済み YAML の Definition/Hover も argoRegistry 経由に統合**
  （現在は各プロバイダーに個別実装されている）
- **差分レンダリング**: テンプレート変更時に全体再レンダリングではなく変更分のみ
- **values.yaml バリエーション**: `--set` や `--values` で異なる値セットでの診断
- **一時 ArgoTemplateIndex のキャッシュ**: Chart 全体レンダリング結果をキャッシュし再利用
