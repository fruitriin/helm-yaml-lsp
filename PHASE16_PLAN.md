# Phase 16: 差分レンダリング — テンプレート変更時の部分再レンダリング

## 背景

現在、Helm テンプレートファイルまたは values.yaml が変更されると、チャート全体のキャッシュが一括クリアされる。次にレンダリングが必要になった時点で `helm template` がチャート全体を再実行し、`RenderedArgoIndexCache` が全テンプレートの ArgoTemplateIndex を再構築する。

チャートに N 個のテンプレートがある場合、1ファイルの変更で:
1. `helmTemplateExecutor.clearCache(chartDir)` → チャート全体のキャッシュ消失
2. `renderedArgoIndexCache.getRegistry()` → `helm template` 再実行（10秒タイムアウト）
3. 全ドキュメントの `argoIndex.indexDocument()` が再実行される
4. `symbolMappingIndex` は変更テンプレートのみ再構築するが、`RenderedArgoIndexCache` 側は全再構築

テンプレート数が多いチャート（20+ファイル）では顕著なレイテンシが発生する。

## 目標

**変更されたテンプレートのみを差分的に再レンダリング・再インデックスし、未変更テンプレートのキャッシュを保持する。**

改善前: テンプレート1ファイル変更 → チャート全体レンダリング + 全インデックス再構築
改善後: テンプレート1ファイル変更 → 変更ファイルのみ再レンダリング + 差分インデックス更新

## 設計

### 概要

```
テンプレート変更イベント
  ↓
server.ts: ★ 変更ファイルを dirty set に記録（clearCache 全体はしない）
  ↓
診断/Hover/Definition リクエスト
  ↓
RenderedArgoIndexCache.getRegistry(chartDir)
  ├─ dirty set が空 → キャッシュヒット（既存動作）
  └─ dirty set あり → 差分レンダリングパス:
       ├─ 変更テンプレートのみ renderSingleTemplate()
       ├─ 変更テンプレートの argoIndex エントリを置換
       ├─ registry を再構築
       └─ dirty set をクリア
```

### Step 1: HelmTemplateExecutor — テンプレート単位キャッシュの分離

**ファイル**: `packages/server/src/services/helmTemplateExecutor.ts`

現状 `clearCache(chartDir)` は `chartDir::` プレフィックスの全エントリを削除する。これを改善し、テンプレート単位のキャッシュと全体キャッシュを分離する。

**変更内容**:

```typescript
// 新メソッド: 特定テンプレートのキャッシュのみ無効化
clearTemplateCache(chartDir: string, templatePath: string): void {
  // テンプレート固有キャッシュ `chartDir::releaseName::templatePath` を削除
  // チャート全体キャッシュ `chartDir::releaseName` も削除（全体出力が変わるため）
  // ただし他テンプレートの個別キャッシュは保持
}

// 既存メソッド clearCache(chartDir) はそのまま維持（values.yaml 変更時用）
```

**rationale**: `renderSingleTemplate()` のキャッシュ（`--show-only` 結果）は他テンプレートの変更に影響されないため、変更テンプレート以外のキャッシュは安全に保持できる。チャート全体キャッシュ（`renderChart` 結果）は全テンプレートの結合出力なので常に無効化が必要。

### Step 2: RenderedArgoIndexCache — per-template キャッシュと差分更新

**ファイル**: `packages/server/src/services/renderedArgoIndexCache.ts`

現状はチャート全体の出力ハッシュで一致判定し、不一致なら全再構築。これをテンプレート単位のキャッシュに変更する。

**変更内容**:

```typescript
type CachedChart = {
  argoIndex: ArgoTemplateIndex;
  registry: ReferenceRegistry;
  /** テンプレートごとのレンダリング結果キャッシュ */
  templates: Map<string, PerTemplateCacheEntry>;
  /** dirty テンプレートの集合（差分更新対象） */
  dirtyTemplates: Set<string>;
};

type PerTemplateCacheEntry = {
  contentHash: string;          // テンプレート個別のハッシュ
  textDocument: TextDocument;
};
```

**新しい getRegistry() フロー**:

```
getRegistry(chartDir):
  cached = cache.get(chartDir)

  if !cached:
    → renderChart() で全体レンダリング（初回、従来通り）
    → 全テンプレートをインデックス
    → per-template ハッシュを記録
    return registry

  if cached.dirtyTemplates.size === 0:
    return cached.registry  // 完全キャッシュヒット

  // 差分更新パス
  for each dirtyTemplate:
    result = renderSingleTemplate(chartDir, dirtyTemplate)
    if result.success:
      newHash = simpleHash(result.documents[0].content)
      oldEntry = cached.templates.get(dirtyTemplate)
      if oldEntry?.contentHash !== newHash:
        // ArgoTemplateIndex から旧エントリを削除
        argoIndex.removeDocument(renderedUri)
        // 新しい内容でインデックス
        argoIndex.indexDocument(renderedUri, newContent)
        // per-template キャッシュを更新
        cached.templates.set(dirtyTemplate, { contentHash: newHash, textDocument: newDoc })

  cached.dirtyTemplates.clear()
  // registry を再構築（argoIndex が更新済みなので軽量）
  cached.registry = createArgoOnlyRegistry(cached.argoIndex, configMapIndex)
  return cached.registry
```

**新メソッド**:

```typescript
/** 特定テンプレートを dirty としてマーク（キャッシュは即座に消さない） */
markDirty(chartDir: string, templatePath: string): void

/** 全テンプレートを dirty にマーク（values.yaml 変更時） */
markAllDirty(chartDir: string): void
```

### Step 3: ArgoTemplateIndex — ドキュメント単位の削除メソッド追加

**ファイル**: `packages/server/src/services/argoTemplateIndex.ts`

現状 `removeFile(uri)` は既に存在するが、`indexDocument()` で追加したエントリの URI 形式が `file:///rendered/...` であるため、それに対応した削除が必要。

**変更内容**:

```typescript
// 既存の removeFile(uri) が file:///rendered/ URI にも対応しているか確認
// 対応していなければ修正（内部の uriToFilePath 変換がスキップされるよう）
```

実際には `removeFile` のロジックを確認し、`file:///rendered/` プレフィックスの URI でも正しくエントリを削除できることを保証する。

### Step 4: server.ts — 変更イベントの差分化

**ファイル**: `packages/server/src/server.ts`

現状のテンプレート変更ハンドラ（L237-254）を変更し、チャート全体の `clearCache` を `markDirty` に置き換える。

**変更内容**:

```
変更前（テンプレート変更時）:
  helmTemplateIndex.updateTemplateFile(uri)
  symbolMappingIndex.invalidate(chartDir, templatePath)
  helmTemplateExecutor.clearCache(chartDir)        ← チャート全体クリア

変更後:
  helmTemplateIndex.updateTemplateFile(uri)
  symbolMappingIndex.invalidate(chartDir, templatePath)
  helmTemplateExecutor.clearTemplateCache(chartDir, templatePath)  ← テンプレート単位
  renderedArgoIndexCache.markDirty(chartDir, templatePath)         ← 差分マーク
```

```
変更前（values.yaml 変更時）:
  valuesIndex.updateValuesFile(uri)
  symbolMappingIndex.invalidate(chartDir)
  helmTemplateExecutor.clearCache(chartDir)        ← 全クリア

変更後:
  valuesIndex.updateValuesFile(uri)
  symbolMappingIndex.invalidate(chartDir)
  helmTemplateExecutor.clearCache(chartDir)        ← 全クリア（values は全テンプレートに影響）
  renderedArgoIndexCache.markAllDirty(chartDir)    ← 全テンプレートを dirty に
```

### Step 5: RenderedArgoIndexCache — getRenderedDocument の差分対応

`getRenderedDocument(chartDir, templatePath)` が呼ばれた時、そのテンプレートが dirty であれば個別に再レンダリングする。

```typescript
async getRenderedDocument(chartDir, templatePath): Promise<TextDocument | null> {
  const cached = this.cache.get(chartDir);
  if (!cached) {
    // フルレンダリングにフォールバック
    await this.getRegistry(chartDir);
    return this.getRenderedDocumentFromCache(chartDir, templatePath);
  }

  // このテンプレートが dirty なら個別更新
  if (cached.dirtyTemplates.has(templatePath)) {
    await this.refreshSingleTemplate(cached, chartDir, templatePath);
  }

  const entry = cached.templates.get(templatePath);
  return entry?.textDocument ?? null;
}
```

## 変更対象ファイル

| ファイル | 変更内容 | リスク |
|---------|---------|-------|
| `services/helmTemplateExecutor.ts` | `clearTemplateCache()` メソッド追加 | 低 — 既存メソッドはそのまま |
| `services/renderedArgoIndexCache.ts` | per-template キャッシュ化 + `markDirty` / `markAllDirty` | 中 — キャッシュ構造の変更 |
| `services/argoTemplateIndex.ts` | `removeFile` の rendered URI 対応確認 | 低 — 既存動作の確認のみ |
| `server.ts` | 変更イベントハンドラの差分化 | 低 — 呼び出し先の変更のみ |
| `types/rendering.ts` | 必要に応じて新型定義追加 | 低 |

変更しないファイル: `symbolMappingIndex.ts`（既にテンプレート単位の invalidate を実装済み）、`fileCache.ts`、`diagnosticProvider.ts`、providers 全般

## テスト計画

### 単体テスト

| テストファイル | テスト内容 |
|--------------|-----------|
| `helmTemplateExecutor.test.ts` | `clearTemplateCache()` — 対象テンプレートのみクリア、他は保持 |
| `renderedArgoIndexCache.test.ts` | `markDirty` → `getRegistry` で差分更新される |
| `renderedArgoIndexCache.test.ts` | `markAllDirty` → 全テンプレート再レンダリング |
| `renderedArgoIndexCache.test.ts` | dirty なし → キャッシュヒット（再レンダリングなし） |
| `renderedArgoIndexCache.test.ts` | `getRenderedDocument` — dirty テンプレートの個別更新 |

### 統合テスト

| シナリオ | 期待動作 |
|---------|---------|
| テンプレート A を変更 → 診断リクエスト | A のみ再レンダリング、B/C はキャッシュヒット |
| values.yaml 変更 → 診断リクエスト | 全テンプレート再レンダリング |
| Chart.yaml 変更 → 診断リクエスト | 全キャッシュクリア + フルレンダリング |

## 実装順序

1. **Step 1**: `HelmTemplateExecutor.clearTemplateCache()` 追加 + テスト
2. **Step 3**: `ArgoTemplateIndex.removeFile()` の rendered URI 対応確認
3. **Step 2**: `RenderedArgoIndexCache` の per-template 化 + `markDirty` / `markAllDirty` + テスト
4. **Step 5**: `getRenderedDocument` の差分対応
5. **Step 4**: `server.ts` のイベントハンドラ差分化
6. 統合テスト + 全テスト通過確認

## 影響範囲

- **パフォーマンス改善**: テンプレート1ファイル変更時、`helm template --show-only` （単一テンプレート）のみ実行。チャート全体の `helm template` は初回のみ。
- **リスク**: `RenderedArgoIndexCache` のキャッシュ構造変更。ArgoTemplateIndex の差分更新（`removeDocument` → `indexDocument`）の正確性が重要。
- **フォールバック**: dirty set に全テンプレートが入った場合は従来の全体レンダリングと同等。キャッシュミス時もフルレンダリングにフォールバック。
- **既存テストへの影響**: `RenderedArgoIndexCache` のテストは内部構造変更により修正が必要。他プロバイダーのテストは影響なし。

## 制約・前提

- `helm template --show-only <path>` は他テンプレートの `{{ include }}` / `{{ template }}` の影響を受けない前提。ただし `_helpers.tpl` の変更は全テンプレートに影響するため、`.tpl` ファイル変更時は `markAllDirty` を使用する。
- `renderSingleTemplate` の結果と `renderChart` の同一テンプレート出力は同一であることを前提とする（values/Chart.yaml が同じなら）。
- values.yaml の変更は全テンプレートの出力に影響し得るため、差分最適化の対象外（全 dirty マーク）。
