# Phase 21: Rename / Refactoring (`textDocument/rename`)

## 目的

テンプレート名・パラメータ名・`.Values` キー・ConfigMap/Secret 名・
Helm テンプレート定義名のリネームを、参照箇所を含めてワークスペース全体で一括実行する。

Phase 19（Find All References）を前提とし、その参照検索結果を TextEdit に変換する。

---

## 対象

| リネーム対象 | 定義側の変更 | 参照側の変更 |
|-------------|-------------|-------------|
| Argo テンプレート名 | `templates: - name: xxx` | `template: xxx`, `templateRef.template: xxx` |
| パラメータ名 | `inputs.parameters: - name: xxx` | `{{inputs.parameters.xxx}}` |
| `.Values` キー | values.yaml の `xxx: val` | `{{ .Values.xxx }}` |
| Helm テンプレート名 | `{{- define "xxx" -}}` | `{{ include "xxx" . }}`, `{{ template "xxx" . }}` |
| ConfigMap/Secret 名 | `metadata.name: xxx` | `configMapKeyRef.name: xxx`, `configMapRef.name: xxx` 等 |
| ConfigMap/Secret key | `data: { xxx: val }` | `configMapKeyRef.key: xxx` |

---

## 設計

### Step 1: ReferenceHandler インターフェース拡張

`references/handler.ts`:

```typescript
export type ReferenceHandler = {
  // ... 既存
  findReferences?(...): Location[];  // Phase 19

  // 新規: リネーム可能かの判定 + 対象範囲
  prepareRename?(doc: TextDocument, pos: Position): {
    range: Range;
    placeholder: string;
  } | null;

  // 新規: リネーム用 TextEdit 生成
  computeRenameEdits?(
    doc: TextDocument,
    detected: DetectedReference,
    newName: string,
    allDocuments: TextDocument[]
  ): WorkspaceEdit;
};
```

### Step 2: RenameProvider 新規作成

**新規ファイル**: `providers/renameProvider.ts`

```typescript
export class RenameProvider {
  constructor(
    private registry: ReferenceRegistry,
    private documents: TextDocuments<TextDocument>
  ) {}

  prepareRename(doc: TextDocument, position: Position): {
    range: Range;
    placeholder: string;
  } | null {
    // registry 経由で detect → handler.prepareRename
  }

  async provideRenameEdits(
    doc: TextDocument,
    position: Position,
    newName: string
  ): Promise<WorkspaceEdit | null> {
    // 1. detect で参照を特定
    // 2. resolve で定義を取得
    // 3. findReferences で全参照を取得
    // 4. 定義 + 全参照の TextEdit を WorkspaceEdit にまとめる
  }
}
```

### Step 3: 各ハンドラーの Rename ロジック

#### argoTemplateHandler

```yaml
# 定義側: name の値部分を置換
templates:
  - name: old-name    →  - name: new-name

# 参照側: template の値部分を置換
template: old-name    →  template: new-name

# templateRef 参照側
templateRef:
  template: old-name  →  template: new-name
```

- `prepareRename`: `name:` の値の Range + 現在の名前を返す
- `computeRenameEdits`: 定義行の値 + 全参照行の値を置換

#### argoParameterHandler

```yaml
# 定義
inputs:
  parameters:
    - name: old-param  →  - name: new-param

# 参照（Argo テンプレート式内）
"{{inputs.parameters.old-param}}"  →  "{{inputs.parameters.new-param}}"
```

- 式内のパラメータ名部分のみ正確に置換
- `{{steps.xxx.outputs.parameters.old-param}}` パターンも対応

#### helmValuesHandler

```yaml
# values.yaml — キーの置換
old_key: value  →  new_key: value

# テンプレート内 — .Values.xxx の置換
{{ .Values.old_key }}  →  {{ .Values.new_key }}
```

- ネストされたキー（`a.b.c`）の場合、該当レベルのみ置換
- values.yaml + 全テンプレートファイルを横断

#### helmTemplateHandler

```yaml
# 定義
{{- define "old-name" -}}  →  {{- define "new-name" -}}

# 参照
{{ include "old-name" . }}  →  {{ include "new-name" . }}
{{ template "old-name" . }}  →  {{ template "new-name" . }}
```

- ダブルクォート内の文字列部分のみ置換

#### configMapHandler

```yaml
# 定義
metadata:
  name: old-config  →  name: new-config

# 参照
configMapKeyRef:
  name: old-config  →  name: new-config
configMapRef:
  name: old-config  →  name: new-config
```

### Step 4: server.ts 統合

```typescript
// capabilities
capabilities: {
  renameProvider: {
    prepareProvider: true,
  },
}

// handlers
connection.onPrepareRename((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  return renameProvider.prepareRename(doc, params.position);
});

connection.onRenameRequest(async (params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  return renameProvider.provideRenameEdits(doc, params.position, params.newName);
});
```

---

## リネーム不可のケース

以下はリネーム対象外（`prepareRename` が `null` を返す）:

- Workflow 変数（`workflow.name` 等）— 仕様定義の予約語
- Helm 組み込み関数（`toYaml`, `default` 等）
- `.Chart.*`, `.Release.*`, `.Capabilities.*` — 読み取り専用
- Go template キーワード（`if`, `range` 等）

---

## テスト計画

| テストファイル | テスト数（目安） | 内容 |
|---------------|-----------------|------|
| `test/providers/renameProvider.test.ts` | 18 | 各参照タイプのリネーム |

### テストケース

1. テンプレート名のリネーム → 定義 + 全参照が更新される
2. パラメータ名のリネーム → 定義 + 式内参照が更新される
3. `.Values` キーのリネーム → values.yaml + テンプレートが更新される
4. Helm テンプレート名のリネーム → define + include/template が更新される
5. ConfigMap 名のリネーム → metadata.name + 全参照が更新される
6. ConfigMap key のリネーム → data キー + configMapKeyRef.key が更新される
7. prepareRename — Workflow 変数は null を返す
8. prepareRename — Helm 組み込み関数は null を返す
9. クロスファイルリネーム（複数ファイルの WorkspaceEdit）
10. ネストされた Values キーのリネーム

---

## 依存関係

- **Phase 19（Find All References）が前提** — 参照収集ロジックを再利用
- Phase 20（Code Actions）とは独立して実装可能

---

## 完了基準

- [ ] `textDocument/prepareRename` が対象範囲を返す
- [ ] `textDocument/rename` が WorkspaceEdit を返す
- [ ] 全参照タイプでクロスファイルリネームが動作する
- [ ] リネーム不可のケースが正しく拒否される
- [ ] VSCode: F2 / Neovim: `<leader>rn` でリネーム実行可能
- [ ] 全テストパス
