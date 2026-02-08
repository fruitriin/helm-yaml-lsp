# Phase 20: Code Actions / Quick Fix (`textDocument/codeAction`)

## 目的

Diagnostics で検出したエラーに対する自動修正候補（Quick Fix）を提供する。
既存の診断機能の価値を大幅に向上させる。

---

## 対象 Code Action

### Priority 1: 存在しない参照の自動作成

| 診断メッセージ | Quick Fix | 対象ファイル |
|---------------|-----------|-------------|
| パラメータ `xxx` が存在しません | `inputs.parameters` に `- name: xxx` を追加 | 同一ファイル |
| `.Values.xxx` が存在しません | values.yaml に `xxx` キーを追加 | values.yaml |
| テンプレート `xxx` が存在しません（include） | `{{- define "xxx" -}}...{{- end -}}` スケルトン生成 | _helpers.tpl |
| ConfigMap `xxx` が存在しません | ConfigMap リソーススケルトン生成 | 新規 or 同一ファイル |

### Priority 2: 未使用リソースの検出と削除提案

| 診断 | Code Action |
|------|------------|
| 未使用パラメータ（定義はあるが参照なし） | パラメータ定義の削除 |
| 未使用 values キー（定義はあるが参照なし） | values.yaml のキー削除（Warning） |

**注意**: 未使用検出は Phase 19（Find All References）完了後に実装するのが自然。

---

## 設計

### Step 1: CodeActionProvider 新規作成

**新規ファイル**: `providers/codeActionProvider.ts`

```typescript
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type {
  CodeAction,
  CodeActionParams,
  Diagnostic,
} from 'vscode-languageserver-types';

export class CodeActionProvider {
  constructor(
    private valuesIndex: ValuesIndex,
    private helmChartIndex: HelmChartIndex,
    private helmTemplateIndex: HelmTemplateIndex,
  ) {}

  provideCodeActions(
    doc: TextDocument,
    params: CodeActionParams
  ): CodeAction[] {
    const actions: CodeAction[] = [];
    for (const diagnostic of params.context.diagnostics) {
      actions.push(...this.getFixesForDiagnostic(doc, diagnostic));
    }
    return actions;
  }

  private getFixesForDiagnostic(
    doc: TextDocument,
    diagnostic: Diagnostic
  ): CodeAction[] {
    // diagnostic.data に { kind, details } を埋め込む（DiagnosticProvider 側で設定）
    // kind に応じて適切な fix を生成
  }
}
```

### Step 2: DiagnosticProvider に diagnostic.data を追加

既存の `diagnosticProvider.ts` で、各 diagnostic に参照情報を埋め込む:

```typescript
{
  range,
  message,
  severity,
  source: 'argo-workflows-lsp',
  data: {
    kind: resolved.detected.kind,      // 'helmValues' | 'argoParameter' | ...
    details: resolved.detected.details, // 参照詳細
  }
}
```

### Step 3: 各 Quick Fix の実装

#### 3a. パラメータ追加

```typescript
// 診断: "Parameter 'xxx' not found in inputs.parameters"
// Fix: 該当テンプレートの inputs.parameters セクションに追加
{
  title: 'Add parameter "xxx" to inputs.parameters',
  kind: CodeActionKind.QuickFix,
  edit: {
    changes: {
      [doc.uri]: [{
        range: insertionPoint,
        newText: '          - name: xxx\n'
      }]
    }
  }
}
```

#### 3b. Values キー追加

```typescript
// 診断: "Value '.Values.xxx.yyy' not found"
// Fix: values.yaml にキーパスを追加
{
  title: 'Add "xxx.yyy" to values.yaml',
  kind: CodeActionKind.QuickFix,
  edit: {
    changes: {
      [valuesUri]: [{
        range: insertionPoint,
        newText: 'xxx:\n  yyy: ""\n'
      }]
    }
  }
}
```

#### 3c. Helm テンプレート定義追加

```typescript
// 診断: "Template 'mychart.xxx' not found"
// Fix: _helpers.tpl にスケルトン追加
{
  title: 'Create template "mychart.xxx" in _helpers.tpl',
  kind: CodeActionKind.QuickFix,
  edit: {
    changes: {
      [helpersUri]: [{
        range: endOfFile,
        newText: '\n{{- define "mychart.xxx" -}}\n{{- end -}}\n'
      }]
    }
  }
}
```

### Step 4: server.ts 統合

```typescript
// capabilities
capabilities: {
  codeActionProvider: {
    codeActionKinds: [CodeActionKind.QuickFix],
  },
}

// handler
connection.onCodeAction((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return codeActionProvider.provideCodeActions(doc, params);
});
```

---

## テスト計画

| テストファイル | テスト数（目安） | 内容 |
|---------------|-----------------|------|
| `test/providers/codeActionProvider.test.ts` | 12 | 各 Quick Fix の生成 |

### テストケース

1. 存在しないパラメータ → Add parameter fix が生成される
2. 存在しない `.Values` キー → Add values key fix が生成される
3. 存在しない include テンプレート → Create template fix が生成される
4. 診断がない範囲 → 空配列
5. ネストされた values キー（`a.b.c`）→ 正しい YAML 構造で追加
6. 既存セクションへの追加（inputs.parameters が既にある場合）
7. 新規セクション作成（inputs セクションがない場合）

---

## 依存関係

- `diagnostic.data` の拡張は後方互換性あり（既存クライアントは無視する）
- Priority 2（未使用検出）は Phase 19 完了後に追加

---

## 完了基準

- [ ] `textDocument/codeAction` が Quick Fix を返す
- [ ] パラメータ / Values / Helm テンプレートの自動追加が動作
- [ ] VSCode: 電球アイコン + Ctrl+. で Quick Fix 適用可能
- [ ] Neovim: `<leader>ca` で Code Action 選択可能
- [ ] 全テストパス
