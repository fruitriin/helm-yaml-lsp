# Phase 22: Inlay Hints (`textDocument/inlayHint`)

## 目的

Helm テンプレート内の `.Values` 参照・パラメータ参照の隣に、
解決された実際の値をゴーストテキスト（Inlay Hint）として表示する。

テンプレートを読むだけで values.yaml やパラメータのデフォルト値が分かり、
ファイル間の行き来を減らす。

---

## 表示対象

### `.Values` 参照

```yaml
# 表示イメージ（`: alpine` がInlay Hint）
image: {{ .Values.image.repository }}: alpine
tag: {{ .Values.image.tag }}: latest
replicas: {{ .Values.replicaCount }}: 3
```

### パラメータのデフォルト値

```yaml
# Argo テンプレート内
args:
  - "{{inputs.parameters.message}}": "Hello World"
```

### ConfigMap/Secret キーの値プレビュー

```yaml
# 値が短い場合のみ表示
configMapKeyRef:
  name: app-config
  key: database-url: postgres://localhost/mydb
```

Secret の値は `[hidden]` として表示（既存のホバー動作と一致）。

---

## 設計

### Step 1: InlayHintProvider 新規作成

**新規ファイル**: `providers/inlayHintProvider.ts`

```typescript
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { InlayHint, Range } from 'vscode-languageserver-types';

export class InlayHintProvider {
  constructor(
    private registry: ReferenceRegistry,
    private valuesIndex: ValuesIndex,
    private helmChartIndex: HelmChartIndex,
    private configMapIndex: ConfigMapIndex,
  ) {}

  provideInlayHints(doc: TextDocument, range: Range): InlayHint[] {
    const hints: InlayHint[] = [];

    // range 内の行を走査し、参照を検出
    for (let line = range.start.line; line <= range.end.line; line++) {
      hints.push(...this.getHintsForLine(doc, line));
    }

    return hints;
  }

  private getHintsForLine(doc: TextDocument, line: number): InlayHint[] {
    // 1. .Values 参照を検出 → valuesIndex から値を取得
    // 2. パラメータ参照を検出 → default 値を取得
    // 3. ConfigMap key 参照を検出 → 値プレビューを取得
  }
}
```

### Step 2: `.Values` Inlay Hint の実装

```typescript
private getValuesHint(
  doc: TextDocument,
  match: { valuePath: string; endPosition: Position }
): InlayHint | null {
  const chartDir = this.helmChartIndex.findChartForFile(doc.uri);
  if (!chartDir) return null;

  const value = this.valuesIndex.getValue(chartDir, match.valuePath);
  if (value === undefined) return null;

  // 値のフォーマット
  const display = formatHintValue(value);
  if (!display) return null;

  return {
    position: match.endPosition,  // 式の閉じ `}}` の後
    label: `: ${display}`,
    kind: InlayHintKind.Type,
    paddingLeft: false,
    paddingRight: true,
  };
}
```

### Step 3: 値のフォーマットルール

```typescript
function formatHintValue(value: unknown): string | null {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    if (value.length > 30) return `"${value.substring(0, 27)}..."`;
    return `"${value}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return `{...}`;
  return null;
}
```

**制約**:
- 文字列: 30文字以下のみ表示、超過は省略
- 配列: 要素数のみ
- オブジェクト: `{...}` のみ（ネストは表示しない）
- null/undefined: `null`

### Step 4: server.ts 統合

```typescript
// capabilities
capabilities: {
  inlayHintProvider: {
    resolveProvider: false,  // 静的ヒントのみ、遅延解決なし
  },
}

// handler
connection.languages.inlayHint.on((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return inlayHintProvider.provideInlayHints(doc, params.range);
});
```

---

## パフォーマンス考慮

- `range` パラメータを活用し、可視領域のみ処理（スクロール外は計算しない）
- 1行に複数参照がある場合も正しく処理
- values.yaml の値取得は `ValuesIndex` のインメモリキャッシュを使用（I/O なし）

---

## テスト計画

| テストファイル | テスト数（目安） | 内容 |
|---------------|-----------------|------|
| `test/providers/inlayHintProvider.test.ts` | 14 | 各参照タイプの Hint 生成 |

### テストケース

1. `.Values.xxx` → 文字列値が表示される
2. `.Values.xxx` → 数値が表示される
3. `.Values.xxx` → boolean が表示される
4. `.Values.xxx` → 配列は `[N items]` で表示
5. `.Values.xxx` → オブジェクトは `{...}` で表示
6. `.Values.xxx` → 長い文字列は省略される
7. `.Values.xxx` → 存在しないキーは Hint なし
8. パラメータ参照 → default 値が表示される
9. パラメータ参照 → default なしは Hint なし
10. ConfigMap key → 値が表示される
11. Secret key → `[hidden]` が表示される
12. 非 Helm ファイル → Hint なし
13. range 外の行は処理されない
14. 1行に複数参照 → 各参照に Hint

---

## 完了基準

- [ ] `textDocument/inlayHint` が Helm テンプレートで動作する
- [ ] `.Values` 参照に解決値が表示される
- [ ] パラメータ参照にデフォルト値が表示される
- [ ] ConfigMap/Secret 参照に値プレビューが表示される
- [ ] Secret の値は `[hidden]` で隠蔽される
- [ ] VSCode / Neovim でゴーストテキストとして表示される
- [ ] 全テストパス
