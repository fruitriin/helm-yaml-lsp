# Phase 18: 一時 ArgoTemplateIndex のキャッシュ最適化

## 背景

Phase 15B/16/17 で `RenderedArgoIndexCache` が導入・強化され、Helm チャートのレンダリング結果に対する
ArgoTemplateIndex の構築・差分更新が実現した。しかし以下の非効率が残っている：

1. **不要な registry 再構築**: 差分更新のたびに `createArgoOnlyRegistry()` が呼ばれ、ハンドラーオブジェクトが毎回再生成される。実際にはハンドラーは同一 `argoIndex` インスタンスをクロージャ参照しているため、in-place 変更が自動的に反映される
2. **`removeFile()` が O(n) の線形スキャン**: URI → キー の逆引きインデックスがない
3. **TextDocument の二重作成**: `RenderedArgoIndexCache` と `ArgoTemplateIndex.indexDocumentContent()` が同一コンテンツに対してそれぞれ `TextDocument.create()` を呼ぶ
4. **dirty テンプレートの逐次処理**: 複数テンプレートが dirty のとき、1 つずつ順番に再レンダリングしている
5. **CompletionProvider のダミーインスタンス**: 使用されない空の `ArgoTemplateIndex` が生成される

---

## ゴール

- `RenderedArgoIndexCache` の差分更新パスの計算量・アロケーションを削減
- `ArgoTemplateIndex.removeFile()` を O(1) に改善
- 不要な `TextDocument` 生成を排除
- dirty テンプレートの並列レンダリング
- コードの明確化（CompletionProvider のダミー排除）

---

## 実装計画

### 18.1: `ArgoTemplateIndex` — 逆引きインデックスの追加

**ファイル**: `packages/server/src/services/argoTemplateIndex.ts`

**現状の問題**:
```typescript
// removeFile() — 全エントリをスキャンして URI が一致するものを探す O(n)
removeFile(uri: string): void {
  const keysToDelete: string[] = [];
  for (const [key, indexed] of this.index.entries()) {
    if (isSameUri(indexed.uri, uri)) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    this.index.delete(key);
  }
}
```

**変更内容**:
- `private uriToKeys = new Map<string, Set<string>>()` を追加
- `indexDocumentContent()` でキー追加時に逆引きも更新
- `removeFile()` を逆引きで O(1) に書き換え
- `clear()` で逆引きもクリア

```typescript
// After:
removeFile(uri: string): void {
  const normalizedUri = normalizeUri(uri);
  const keys = this.uriToKeys.get(normalizedUri);
  if (!keys) return;
  for (const key of keys) {
    this.index.delete(key);
  }
  this.uriToKeys.delete(normalizedUri);
}
```

**テスト**: 既存テストで十分（`argoTemplateIndex.test.ts` の removeFile テスト）。
逆引き整合性テストを 2〜3 件追加。

---

### 18.2: `ArgoTemplateIndex` — TextDocument 受け取りオーバーロード

**ファイル**: `packages/server/src/services/argoTemplateIndex.ts`

**現状の問題**:
```typescript
// indexDocumentContent() — 毎回 TextDocument.create() を呼ぶ
private indexDocumentContent(uri: string, content: string): void {
  const document = TextDocument.create(uri, 'yaml', 1, content);  // ← 新規作成
  if (!isArgoWorkflowDocument(document)) return;
  const definitions = findTemplateDefinitions(document);
  // ...
}
```

`RenderedArgoIndexCache` は同じコンテンツに対して既に `TextDocument.create()` している：
```typescript
// renderedArgoIndexCache.ts fullRender():
argoIndex.indexDocument(uri, doc.content);           // ← 内部で TextDocument.create()
templates.set(doc.sourceTemplatePath, {
  textDocument: TextDocument.create(uri, 'yaml', 1, doc.content),  // ← 2つ目
});
```

**変更内容**:
- `indexDocument()` に `TextDocument` を直接受け取るオーバーロードを追加
- `RenderedArgoIndexCache` 側で事前に作成した TextDocument を渡す

```typescript
// ArgoTemplateIndex:
indexDocument(uri: string, content: string): void;
indexDocument(document: TextDocument): void;
indexDocument(uriOrDoc: string | TextDocument, content?: string): void {
  if (typeof uriOrDoc === 'string') {
    const doc = TextDocument.create(uriOrDoc, 'yaml', 1, content!);
    this.indexDocumentFromTextDocument(doc);
  } else {
    this.indexDocumentFromTextDocument(uriOrDoc);
  }
}

private indexDocumentFromTextDocument(document: TextDocument): void {
  if (!isArgoWorkflowDocument(document)) return;
  const definitions = findTemplateDefinitions(document);
  // ... 既存ロジック
}
```

```typescript
// RenderedArgoIndexCache fullRender():
for (const doc of renderResult.documents) {
  const uri = `file:///rendered/${doc.sourceTemplatePath}`;
  const textDocument = TextDocument.create(uri, 'yaml', 1, doc.content);
  argoIndex.indexDocument(textDocument);  // TextDocument を直接渡す
  templates.set(doc.sourceTemplatePath, {
    contentHash: simpleHash(doc.content),
    textDocument,                          // 同一インスタンスを再利用
  });
}
```

**テスト**: 既存テストで十分。TextDocument 直接渡しの追加テスト 1 件。

---

### 18.3: `RenderedArgoIndexCache` — 不要な registry 再構築の排除

**ファイル**: `packages/server/src/services/renderedArgoIndexCache.ts`

**現状の問題**:
```typescript
// refreshDirtyTemplates():
if (changed) {
  // ↓ argoIndex は in-place 変更済み。ハンドラーは同一インスタンスを
  //   クロージャ参照しているので、この再構築は不要
  cached.registry = createArgoOnlyRegistry(cached.argoIndex, this.configMapIndex);
}
```

**根拠**: `createArgoTemplateHandler(_argoTemplateIndex)` はクロージャで `_argoTemplateIndex` を
捕捉する。`ArgoTemplateIndex` は内部 Map を mutate するため、同一インスタンスへの変更は
既存ハンドラーから自動的に可視。`ConfigMapIndex` も同じ原理。

**変更内容**:
- `refreshDirtyTemplates()` から `createArgoOnlyRegistry()` 呼び出しを削除
- `import { createArgoOnlyRegistry }` は `fullRender()` でまだ使うので残す

```typescript
// After:
private async refreshDirtyTemplates(cached: CachedChart, chartDir: string): Promise<void> {
  const dirtyList = [...cached.dirtyTemplates];
  cached.dirtyTemplates.clear();

  for (const templatePath of dirtyList) {
    await this.refreshSingleTemplate(cached, chartDir, templatePath);
  }
  // registry 再構築は不要 — ハンドラーは同一 argoIndex をクロージャ参照
}
```

**テスト**: 既存テスト（差分テスト 7 件）が通ることを確認。
追加テスト: 差分更新後の `registry.detectAndResolve()` が正しく解決できることを検証。

---

### 18.4: `RenderedArgoIndexCache` — dirty テンプレートの並列レンダリング

**ファイル**: `packages/server/src/services/renderedArgoIndexCache.ts`

**現状の問題**:
```typescript
// refreshDirtyTemplates() — 逐次実行
for (const templatePath of dirtyList) {
  await this.refreshSingleTemplate(cached, chartDir, templatePath);
}
```

**変更内容**:
- `Promise.all()` で並列実行

```typescript
// After:
private async refreshDirtyTemplates(cached: CachedChart, chartDir: string): Promise<void> {
  const dirtyList = [...cached.dirtyTemplates];
  cached.dirtyTemplates.clear();

  await Promise.all(
    dirtyList.map(templatePath =>
      this.refreshSingleTemplate(cached, chartDir, templatePath)
    )
  );
}
```

**注意**: `refreshSingleTemplate()` は `cached.argoIndex.removeFile()` と `indexDocument()` を
呼ぶため、`ArgoTemplateIndex` の内部 Map 操作がレースする可能性がある。
しかし JavaScript はシングルスレッドであり、`Promise.all` 内の各 Promise は
`await this.helmTemplateExecutor.renderSingleTemplate()` で yield するが、
Map 操作自体は同期的なため安全。

**テスト**: 既存差分テストで検証。

---

### 18.5: `CompletionProvider` — ダミー ArgoTemplateIndex の排除

**ファイル**: `packages/server/src/providers/completionProvider.ts`, `packages/server/src/references/setup.ts`

**現状の問題**:
```typescript
// CompletionProvider constructor:
this.registry = registry ??
  createReferenceRegistry(
    new ArgoTemplateIndex(),  // ← 空のダミー。Completion では Argo 参照を使わない
    helmChartIndex, valuesIndex, helmTemplateIndex, configMapIndex
  );
```

**変更内容**:

**案 A（推奨）**: `createReferenceRegistry` の `argoTemplateIndex` をオプショナルにする。

```typescript
// setup.ts:
export function createReferenceRegistry(
  _argoTemplateIndex?: ArgoTemplateIndex,  // ← optional に変更
  ...
): ReferenceRegistry {
  // ...
  // Phase 3: Argo guard — argoTemplateIndex がない場合はガードを登録しない
  if (_argoTemplateIndex) {
    const argoTemplateHandler = createArgoTemplateHandler(_argoTemplateIndex);
    // ...
    registry.addGuard({ name: 'argo', ... });
  }
  return registry;
}
```

```typescript
// CompletionProvider:
this.registry = registry ??
  createReferenceRegistry(
    undefined,  // Argo 参照は Completion で不要
    helmChartIndex, valuesIndex, helmTemplateIndex, configMapIndex
  );
```

**テスト**: CompletionProvider の既存テストが通ることを確認。

---

### 18.6: テスト

**新規テストファイル**: 既存テストファイルに追加

| ファイル | 追加テスト | 内容 |
|---------|-----------|------|
| `argoTemplateIndex.test.ts` | +3 | 逆引きインデックス整合性、TextDocument 直接渡し、大量 removeFile |
| `renderedArgoIndexCache.test.ts` | +2 | 差分更新後の参照解決検証、並列レンダリング検証 |
| `completionProvider.test.ts` | +1 | ArgoTemplateIndex なしでの registry 構築 |

---

## 実装順序

```
18.1 逆引きインデックス
 ↓
18.2 TextDocument 受け取り
 ↓
18.3 registry 再構築排除  ← 18.2 の TextDocument 渡しを利用
 ↓
18.4 並列レンダリング
 ↓
18.5 CompletionProvider ダミー排除
 ↓
18.6 テスト（各ステップで随時追加）
```

18.1〜18.2 は `ArgoTemplateIndex` の変更（provider/cache 側に影響しない）。
18.3〜18.4 は `RenderedArgoIndexCache` の変更。
18.5 は `CompletionProvider` + `setup.ts` の変更。
各ステップは独立してテスト可能。

---

## リスク分析

| ステップ | リスク | 軽減策 |
|---------|--------|--------|
| 18.1 逆引きインデックス | 低 — 同期的 Map 操作 | 既存テスト + 整合性テスト追加 |
| 18.2 TextDocument 渡し | 低 — オーバーロード追加のみ | 既存テスト |
| 18.3 registry 再構築排除 | 中 — クロージャ参照の前提に依存 | 差分更新後の解決テストで検証 |
| 18.4 並列レンダリング | 低 — JS シングルスレッド | 既存差分テスト |
| 18.5 ダミー排除 | 低 — Completion は Argo 未使用 | 既存 Completion テスト |

---

## 期待される効果

| 指標 | Before | After |
|------|--------|-------|
| `removeFile()` 計算量 | O(n) | O(1) |
| dirty refresh 時の `createArgoOnlyRegistry()` | 毎回 | なし（初回のみ） |
| dirty refresh 時の TextDocument 生成 | 2 × dirty 数 | 1 × dirty 数 |
| dirty テンプレート N 件のレンダリング | 逐次 N 回 | 並列 N 回 |
| CompletionProvider の余分なインスタンス | 1 | 0 |
