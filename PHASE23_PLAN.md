# Phase 23: Code Lens — 参照カウント表示 (`textDocument/codeLens`)

## 目的

テンプレート定義・ConfigMap/Secret 定義・values.yaml のキー・
Helm テンプレート定義（`define`）の上に「N references」のインラインリンクを表示し、
クリックで全参照一覧にジャンプできるようにする。

大きな Chart で「このリソースは使われているのか？」を即座に判断できる。

---

## 表示対象

### Argo テンプレート定義

```yaml
spec:
  templates:
    - name: build-image         # 5 references
      container:
        image: alpine
    - name: unused-template     # 0 references
      container:
        image: busybox
```

### ConfigMap/Secret 定義

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config             # 3 references
data:
  database-url: postgres://...  # 2 references
  unused-key: value             # 0 references
```

### values.yaml のトップレベルキー

```yaml
# values.yaml
replicaCount: 3                # 2 references
image:                         # 4 references
  repository: alpine
  tag: latest
unusedKey: value               # 0 references
```

### Helm テンプレート定義

```yaml
{{- define "mychart.name" -}}  # 6 references
{{ .Chart.Name }}
{{- end -}}
```

---

## 設計

### Step 1: CodeLensProvider 新規作成

**新規ファイル**: `providers/codeLensProvider.ts`

```typescript
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CodeLens } from 'vscode-languageserver-types';

export class CodeLensProvider {
  constructor(
    private registry: ReferenceRegistry,
    private documents: TextDocuments<TextDocument>,
    private argoTemplateIndex: ArgoTemplateIndex,
    private configMapIndex: ConfigMapIndex,
    private valuesIndex: ValuesIndex,
    private helmTemplateIndex: HelmTemplateIndex,
  ) {}

  provideCodeLenses(doc: TextDocument): CodeLens[] {
    const lenses: CodeLens[] = [];

    // ドキュメントの種類に応じて定義を検出
    lenses.push(...this.getArgoTemplateLenses(doc));
    lenses.push(...this.getConfigMapLenses(doc));
    lenses.push(...this.getValuesLenses(doc));
    lenses.push(...this.getHelmDefineLenses(doc));

    return lenses;
  }

  resolveCodeLens(codeLens: CodeLens): CodeLens {
    // codeLens.data に埋め込んだ情報から参照カウントを計算
    // command を設定してクリック可能にする
  }
}
```

### Step 2: 参照カウントの計算

Phase 19 の `findReferences` を再利用する。

```typescript
private async countReferences(
  kind: ReferenceKind,
  name: string,
  allDocuments: TextDocument[]
): Promise<number> {
  // 各ハンドラーの findAll を全ドキュメントに適用し、
  // name が一致する参照の数を返す
}
```

**最適化**: Code Lens は頻繁に呼ばれるため、参照カウントをキャッシュする。
`resolveCodeLens` で遅延計算する（初回表示は `...` → 解決後に `N references`）。

### Step 3: CodeLens の生成

```typescript
// Argo テンプレート定義の場合
{
  range: nameRange,  // `- name: build-image` の Range
  data: {
    kind: 'argoTemplate',
    templateName: 'build-image',
  },
  command: undefined  // resolveCodeLens で設定
}

// resolveCodeLens 後
{
  range: nameRange,
  command: {
    title: '5 references',
    command: 'editor.action.showReferences',
    arguments: [docUri, nameRange.start, locations]
  }
}
```

### Step 4: 定義位置の検出

既存の features 関数を再利用:

| 対象 | 検出関数 |
|------|---------|
| Argo テンプレート | `findTemplateDefinitions()` |
| ConfigMap/Secret | `findConfigMapDefinitions()` |
| values.yaml キー | `ValuesIndex.getValues()` |
| Helm define | `findHelmTemplateDefinitions()` |

### Step 5: server.ts 統合

```typescript
// capabilities
capabilities: {
  codeLensProvider: {
    resolveProvider: true,
  },
}

// handlers
connection.onCodeLens((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return codeLensProvider.provideCodeLenses(doc);
});

connection.onCodeLensResolve((codeLens) => {
  return codeLensProvider.resolveCodeLens(codeLens);
});
```

---

## パフォーマンス考慮

- **遅延解決**: `provideCodeLenses` では位置のみ返し、`resolveCodeLens` で参照カウントを計算
- **キャッシュ**: ドキュメント変更時にキャッシュを無効化、次回 resolve で再計算
- **バッチ処理**: 同一ドキュメントの複数 Code Lens を一括で resolve（全ドキュメント走査は1回）

---

## テスト計画

| テストファイル | テスト数（目安） | 内容 |
|---------------|-----------------|------|
| `test/providers/codeLensProvider.test.ts` | 12 | 各定義タイプの Code Lens 生成 |

### テストケース

1. Argo テンプレート定義に Code Lens が表示される
2. 参照されていないテンプレート → `0 references`
3. ConfigMap 定義に Code Lens が表示される
4. ConfigMap data key に Code Lens が表示される
5. values.yaml のキーに Code Lens が表示される
6. Helm define ブロックに Code Lens が表示される
7. 非対象ファイル → Code Lens なし
8. resolveCodeLens で正しいカウントが設定される
9. resolveCodeLens で command が設定される
10. 参照カウント 0 → 表示スタイルが異なる（`0 references`）

---

## 依存関係

- **Phase 19（Find All References）が前提** — 参照カウントに `findReferences` を使用
- Phase 20, 21, 22 とは独立して実装可能

---

## 完了基準

- [ ] `textDocument/codeLens` が定義位置に参照カウントを表示する
- [ ] `codeLens/resolve` で正しい参照カウントが返る
- [ ] クリックで参照一覧が表示される（`editor.action.showReferences`）
- [ ] 参照 0 件のリソースが識別できる
- [ ] values.yaml / Argo テンプレート / ConfigMap / Helm define 全対応
- [ ] 全テストパス
