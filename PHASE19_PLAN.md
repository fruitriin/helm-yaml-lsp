# Phase 19: Find All References (`textDocument/references`)

## 目的

テンプレート名・パラメータ名・`.Values` キー・ConfigMap/Secret 名など、
定義位置から「この名前を参照している箇所」を全てリストアップする機能を実装する。

Definition（参照→定義）の逆方向であり、LSP の基本機能の一つ。

---

## 対象参照タイプ

| 参照種別 | 定義側の例 | 参照側の例 |
|----------|-----------|-----------|
| argoTemplate (direct) | `templates: - name: build` | `template: build` |
| argoTemplate (templateRef) | `metadata.name: my-wft` + `templates: - name: build` | `templateRef.name: my-wft` + `templateRef.template: build` |
| argoParameter | `inputs.parameters: - name: msg` | `{{inputs.parameters.msg}}` |
| helmValues | values.yaml の `image.tag: latest` | `{{ .Values.image.tag }}` |
| helmTemplate | `{{- define "mychart.name" -}}` | `{{ include "mychart.name" . }}` |
| configMap | `kind: ConfigMap` + `metadata.name: app-config` | `configMapKeyRef.name: app-config` |
| configMap (key) | `data: { db-url: ... }` | `configMapKeyRef.key: db-url` |

---

## 設計

### Step 1: ReferenceHandler インターフェース拡張

`references/handler.ts` に `findReferences` メソッドを追加:

```typescript
export type ReferenceHandler = {
  // ... 既存
  detect(doc: TextDocument, pos: Position): DetectedReference | undefined;
  resolve(doc: TextDocument, detected: DetectedReference): Promise<ResolvedReference>;
  findAll?(doc: TextDocument): DetectedReference[];
  complete?(doc: TextDocument, pos: Position): CompletionItem[] | undefined;

  // 新規: ワークスペース全体から参照を検索
  findReferences?(
    doc: TextDocument,
    detected: DetectedReference,
    allDocuments: TextDocument[]
  ): Location[];
};
```

### Step 2: ReferenceRegistry に `findAllReferences` メソッド追加

`references/registry.ts`:

```typescript
async findAllReferences(
  doc: TextDocument,
  pos: Position,
  allDocuments: TextDocument[]
): Promise<Location[]> {
  for (const guard of this.guards) {
    if (!guard.check(doc)) continue;
    for (const handler of guard.handlers) {
      const detected = handler.detect(doc, pos);
      if (detected && handler.findReferences) {
        return handler.findReferences(doc, detected, allDocuments);
      }
    }
  }
  return [];
}
```

### Step 3: 各ハンドラーに `findReferences` 実装

#### argoTemplateHandler

- 定義位置（`templates: - name: xxx`）にカーソルがある場合:
  - 全ドキュメントの `findAll()` 結果から `templateName` が一致する参照を収集
  - `templateRef.name` / `templateRef.template` / `template:` の3パターン
- 参照位置にカーソルがある場合:
  - まず `resolve()` で定義を特定
  - 定義側の名前で再検索

#### argoParameterHandler

- `findAllParameterReferences()` を全ドキュメントに適用
- パラメータ名でフィルタ

#### helmValuesHandler

- `findAllValuesReferences()` を全 Helm テンプレートに適用
- `valuePath` でフィルタ

#### helmTemplateHandler

- `findAllHelmTemplateReferences()` を全テンプレートに適用
- テンプレート名でフィルタ

#### configMapHandler

- `findAllConfigMapReferences()` を全ドキュメントに適用
- name / key でフィルタ

### Step 4: ReferencesProvider 新規作成

**新規ファイル**: `providers/referencesProvider.ts`

```typescript
export class ReferencesProvider {
  constructor(
    private registry: ReferenceRegistry,
    private documents: TextDocuments<TextDocument>
  ) {}

  async provideReferences(
    doc: TextDocument,
    position: Position,
    _context: ReferenceContext
  ): Promise<Location[]> {
    const allDocs = this.documents.all();
    return this.registry.findAllReferences(doc, position, allDocs);
  }
}
```

### Step 5: server.ts 統合

```typescript
// capabilities
capabilities: {
  referencesProvider: true,
}

// handler
connection.onReferences(async (params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return referencesProvider.provideReferences(doc, params.position, params.context);
});
```

---

## テスト計画

| テストファイル | テスト数（目安） | 内容 |
|---------------|-----------------|------|
| `test/providers/referencesProvider.test.ts` | 15 | 各参照タイプの参照検索 |

### テストケース

1. テンプレート定義 → 全 `template:` / `templateRef` 参照を返す
2. パラメータ定義 → 全 `{{inputs.parameters.xxx}}` 参照を返す
3. `.Values` キー → 全 `{{ .Values.xxx }}` 参照を返す
4. `define` ブロック → 全 `include` / `template` 参照を返す
5. ConfigMap 定義 → 全 `configMapKeyRef.name` 参照を返す
6. ConfigMap key → 全 `configMapKeyRef.key` 参照を返す
7. 参照が0件の場合 → 空配列
8. 参照位置からの逆引き（参照→定義→全参照）
9. クロスファイル参照（複数ファイルにまたがる参照）

---

## 完了基準

- [ ] `textDocument/references` が全参照タイプで動作する
- [ ] VSCode: Shift+F12 / Neovim: `gr` で参照一覧が表示される
- [ ] クロスファイル参照が検出される
- [ ] 全テストパス
