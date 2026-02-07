# Phase 11: LSP拡張機能（Document Symbols / Document Highlight）

## 目的

Helmテンプレートのアウトライン表示とブロックマッチングハイライトを実装。

## 背景

- 旧コードの実装: `vscode-kubernetes-tools-argo/src/helm.symbolProvider.ts` (177行), `vscode-kubernetes-tools-argo/src/helm.blockMatchingProvider.ts` (143行)
- LSP標準capability: `textDocument/documentSymbol`, `textDocument/documentHighlight`
- 現在のserver.tsには未登録

---

## Step 11.1: Document Symbol Provider

**新規ファイル**: `packages/server/src/providers/documentSymbolProvider.ts`

### 設計方針

Helmテンプレートタグ `{{...}}` を一時的にプレースホルダーに置換してYAMLの構造を解析し、
YAML構造を `DocumentSymbol[]` に変換。

### インターフェース

```typescript
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { DocumentSymbol } from 'vscode-languageserver-types';

export class DocumentSymbolProvider {
  provideDocumentSymbols(document: TextDocument): DocumentSymbol[];
}
```

### アルゴリズム

1. **Helmテンプレート符号化**: `{{...}}` をアンダースコアで置換（YAMLパーサーを通すため）
   ```
   name: {{ .Release.Name }} → name: __________________
   ```

2. **インデントベースの構造解析**: YAMLのインデント構造を追跡
   - トップレベルキー (apiVersion, kind, metadata, spec, data 等) → `SymbolKind.Field`
   - `kind:` の値に応じてドキュメント全体のシンボル種別を決定:
     - ConfigMap → `SymbolKind.Class`
     - Deployment → `SymbolKind.Class`
     - Service → `SymbolKind.Class`
     - etc.
   - ネストしたキーは children として階層化

3. **マルチドキュメント対応**: `---` 区切りでドキュメントを分割し、各ドキュメントをトップレベルシンボルとして扱う

### SymbolKind マッピング

| YAMLコンテキスト | SymbolKind |
|-----------------|------------|
| ドキュメント全体 (kind: xxx) | Class |
| metadata, spec, data 等のセクション | Field |
| containers[].name | Method |
| parameters[].name | Variable |
| templates[].name | Function |
| その他のキー | Property |

### マルチドキュメントYAMLの処理

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
---
apiVersion: v1
kind: Service
metadata:
  name: my-service
```

→ 2つのトップレベルシンボル: `ConfigMap: my-config`, `Service: my-service`

---

## Step 11.2: Document Highlight Provider

**新規ファイル**: `packages/server/src/providers/documentHighlightProvider.ts`

### 設計方針

Helmブロック構造（`{{if/range/with/define}}...{{else}}...{{end}}`）の対応タグをハイライト。

### インターフェース

```typescript
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { DocumentHighlight, Position } from 'vscode-languageserver-types';

export class DocumentHighlightProvider {
  provideDocumentHighlights(
    document: TextDocument,
    position: Position
  ): DocumentHighlight[];
}
```

### アルゴリズム

1. **全行からブロックタグを検出**:
   ```
   /\{\{-?\s*(if|else\s+if|else|range|with|define|block|end)\b[^}]*-?\}\}/g
   ```

2. **カーソル位置がタグ範囲内か判定**

3. **ネスト深度追跡で対応するタグを収集**:
   - `if/range/with/define/block` → depth++
   - `end` → depth--
   - `else/else if` → 同じdepth 0 の場合に収集

4. **DocumentHighlight[] として返却**:
   - 開始タグ: `DocumentHighlightKind.Write`
   - 中間タグ (else): `DocumentHighlightKind.Read`
   - 終了タグ: `DocumentHighlightKind.Write`

### 対応するブロック構造

```
{{- if .Values.enabled }}     ← Write highlight
  ...
{{- else if .Values.alt }}    ← Read highlight
  ...
{{- else }}                   ← Read highlight
  ...
{{- end }}                    ← Write highlight
```

```
{{- range .Values.items }}    ← Write highlight
  ...
{{- end }}                    ← Write highlight
```

```
{{- with .Values.config }}    ← Write highlight
  ...
{{- end }}                    ← Write highlight
```

```
{{- define "my-template" }}   ← Write highlight
  ...
{{- end }}                    ← Write highlight
```

---

## Step 11.3: server.ts 変更

**変更ファイル**: `packages/server/src/server.ts`

### capabilities に追加

```typescript
const result: InitializeResult = {
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    definitionProvider: true,
    hoverProvider: true,
    completionProvider: { ... },
    // 追加:
    documentSymbolProvider: true,
    documentHighlightProvider: true,
  },
};
```

### Provider インスタンス作成

```typescript
import { DocumentSymbolProvider } from '@/providers/documentSymbolProvider';
import { DocumentHighlightProvider } from '@/providers/documentHighlightProvider';

const documentSymbolProvider = new DocumentSymbolProvider();
const documentHighlightProvider = new DocumentHighlightProvider();
```

### ハンドラー登録

```typescript
connection.onDocumentSymbol((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return documentSymbolProvider.provideDocumentSymbols(document);
});

connection.onDocumentHighlight((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return documentHighlightProvider.provideDocumentHighlights(document, params.position);
});
```

---

## Step 11.4: テスト

### test/providers/documentSymbolProvider.test.ts (新規)

- `should return symbols for simple YAML document`
- `should handle multi-document YAML (--- separator)`
- `should handle Helm template tags in values`
- `should create nested symbol hierarchy`
- `should detect kind from YAML content`
- `should handle empty document`
- `should handle YAML with only comments`
- `should assign correct SymbolKind based on context`

### test/providers/documentHighlightProvider.test.ts (新規)

- `should highlight matching if/end block`
- `should highlight if/else/end block`
- `should highlight if/else-if/else/end block`
- `should highlight range/end block`
- `should highlight with/end block`
- `should highlight define/end block`
- `should handle nested blocks correctly`
- `should return empty for non-block position`
- `should handle trimming markers ({{- ... -}})`

---

## 推定テスト増: +15〜20

## 検証

```bash
bun run test          # 全テストパス確認
bun run check         # 型チェック + Biome
bun run build         # LSPビルド
```
