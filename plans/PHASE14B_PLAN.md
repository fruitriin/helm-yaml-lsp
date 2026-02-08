# Phase 14B: Semantic Tokens — エディタ非依存の Helm テンプレート構文ハイライト

## 目的

LSP の `textDocument/semanticTokens` を実装し、Helm テンプレート内の Go template 式を
**エディタ非依存**でハイライトする。VSCode・Neovim・Emacs 等すべての LSP クライアントで動作。

TextMate グラマーは VSCode 固有のため採用しない。

---

## 背景

### エディタごとの構文ハイライト事情

| 層 | 担当 | 対象 |
|----|------|------|
| **YAML 構造** | エディタ側（VSCode: built-in YAML、Neovim: tree-sitter-yaml） | `key: value`、`- list`、`---` 等 |
| **Go template 式** | **← 我々が提供（Semantic Tokens）** | `{{ }}` 内のキーワード・関数・変数・値 |
| **意味的色分け** | **← 我々が提供（Semantic Tokens）** | 定義済み参照 vs 未定義、テンプレート名等 |

YAML 部分はエディタの既存機能に任せ、我々は `{{ }}` 内のトークンに集中する。

### LSP Semantic Tokens の仕組み

```
SemanticTokensProvider.provideDocumentSemanticTokens(document)
  → SemanticTokensBuilder.push(line, char, length, tokenType, tokenModifiers)
  → SemanticTokens { resultId, data: number[] }
```

- `tokenType`: `keyword`, `function`, `variable`, `property` 等（インデックスで指定）
- `tokenModifiers`: `definition`, `readonly` 等（ビットマスクで指定）
- `data`: 差分エンコーディング `[deltaLine, deltaChar, length, type, modifiers]` の連続

### 既存パーサーの再利用

我々は既に `{{ }}` 内の各種参照を検出する機能を持っている:

| パーサー | 検出対象 | `findAll` 関数 |
|---------|---------|---------------|
| `helmFunctionFeatures.ts` | Sprig/Helm 関数（`quote`, `default` 等） | `findAllHelmFunctionReferences()` |
| `helmTemplateFeatures.ts` | `define`/`include`/`template` | `findDefineBlocks()` / `findAllTemplateReferences()` |
| `valuesReferenceFeatures.ts` | `.Values.xxx` | `findAllValuesReferences()` |
| `chartReferenceFeatures.ts` | `.Chart.xxx` | `findAllChartReferences()` |
| `releaseCapabilitiesReferenceFeatures.ts` | `.Release.*` / `.Capabilities.*` | `findAllReleaseCapabilitiesReferences()` |

→ Semantic Tokens Provider はこれらを**組み合わせるだけ**で `{{ }}` 内のほぼ全トークンをカバーできる。

---

## トークン定義

### Token Types（サーバーが宣言する legend）

| インデックス | tokenType | 対象 | 例 |
|------------|-----------|------|-----|
| 0 | `keyword` | Go template 制御構文 | `if`, `range`, `with`, `define`, `block`, `end`, `else` |
| 1 | `function` | Sprig/Helm 関数 | `quote`, `default`, `toYaml`, `include`, `template` |
| 2 | `variable` | テンプレート変数 | `$var`, `$key`, `$val` |
| 3 | `property` | ドットアクセス値 | `.Values.image.tag`, `.Release.Name`, `.Chart.Version` |
| 4 | `string` | 文字列リテラル | `"mychart.labels"` |
| 5 | `number` | 数値リテラル | `42`, `3.14` |
| 6 | `comment` | テンプレートコメント | `{{/* comment */}}` |
| 7 | `operator` | パイプ・代入 | `\|`, `:=` |

### Token Modifiers

| ビット | modifier | 用途 |
|--------|----------|------|
| 0 | `definition` | `{{ define "name" }}` の `name` 部分 |
| 1 | `readonly` | `.Release.*`, `.Capabilities.*` 等の組み込み値 |
| 2 | `defaultLibrary` | Sprig 組み込み関数 |

---

## 実装計画

### Step 1: SemanticTokensProvider 基盤

#### 1-1. `providers/semanticTokensProvider.ts`（新規）

```typescript
import { SemanticTokensBuilder } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { SemanticTokens } from 'vscode-languageserver-types';

export const TOKEN_TYPES = [
  'keyword', 'function', 'variable', 'property',
  'string', 'number', 'comment', 'operator',
] as const;

export const TOKEN_MODIFIERS = [
  'definition', 'readonly', 'defaultLibrary',
] as const;

export class SemanticTokensProvider {
  provideDocumentSemanticTokens(document: TextDocument): SemanticTokens {
    const builder = new SemanticTokensBuilder();
    // Step 2〜4 で tokenizer を追加
    return builder.build();
  }
}
```

#### 1-2. `server.ts` — Capability 登録

```typescript
const result: InitializeResult = {
  capabilities: {
    // ...既存...
    semanticTokensProvider: {
      legend: {
        tokenTypes: [...TOKEN_TYPES],
        tokenModifiers: [...TOKEN_MODIFIERS],
      },
      full: true,
      range: true,
    },
  },
};

// ハンドラー登録
connection.languages.semanticTokens.on((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return { data: [] };
  return semanticTokensProvider.provideDocumentSemanticTokens(doc);
});

connection.languages.semanticTokens.onRange((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return { data: [] };
  return semanticTokensProvider.provideDocumentSemanticTokensRange(doc, params.range);
});
```

### Step 2: Go template 式のトークン化

`{{ }}` ブロックを検出し、内部をトークン分類する **コア処理**。

#### 2-1. `features/goTemplateTokenizer.ts`（新規）

```typescript
type TokenSpan = {
  line: number;
  character: number;
  length: number;
  tokenType: number;  // TOKEN_TYPES のインデックス
  tokenModifiers: number;  // ビットマスク
};

/**
 * ドキュメント内の全 {{ }} ブロックを走査し、トークンスパンを返す
 */
export function tokenizeGoTemplateExpressions(document: TextDocument): TokenSpan[] {
  const spans: TokenSpan[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    // {{ }} ブロックを検出
    const blockPattern = /\{\{-?\s*(.*?)\s*-?\}\}/g;
    let match;
    while ((match = blockPattern.exec(line)) !== null) {
      // ブロック開始 {{ / {{-
      spans.push({
        line: lineNum,
        character: match.index,
        length: line[match.index + 2] === '-' ? 3 : 2,
        tokenType: 7, // operator
        tokenModifiers: 0,
      });

      // ブロック内容をトークン化（Step 3 で詳細実装）
      tokenizeBlockContent(match[1], lineNum, /* offset */, spans);

      // ブロック終了 }} / -}}
      // ...
    }
  }

  return spans;
}
```

#### 2-2. ブロック内容のトークン分類

```
{{ if and .Values.enabled (gt .Values.replicas 1) }}
   ^^                                                 → keyword
      ^^^                                             → function (Sprig)
          ^^^^^^^^^^^^^^^                             → property (.Values.*)
                          ^^^^                        → operator/function
                               ^^^^^^^^^^^^^^^^       → property
                                                ^     → number
```

分類ルール（優先順位順）:

1. **コメント**: `/* ... */` → `comment`
2. **キーワード**: `if|else|else if|range|with|define|block|end` → `keyword`
3. **文字列**: `"..."` → `string`
4. **数値**: `-?\d+(\.\d+)?` → `number`
5. **変数**: `$[a-zA-Z_]+` → `variable`
6. **ドットアクセス**: `\.[A-Za-z][\w.]*` → `property`
7. **関数**: 既知の Sprig/Helm 関数名 → `function` + `defaultLibrary`
8. **演算子**: `|`, `:=`, `,` → `operator`

### Step 3: 既存パーサーによる意味的トークン強化

Step 2 の基本トークン化に加え、既存のパーサーで**意味レベル**の情報を付加。

```typescript
// SemanticTokensProvider.provideDocumentSemanticTokens() 内:

// 1. 基本トークン化（Step 2）
const spans = tokenizeGoTemplateExpressions(document);

// 2. define ブロック名 → string + definition modifier
const defines = findDefineBlocks(document);
for (const def of defines) {
  // "name" 部分に definition modifier を追加
  markTokenModifier(spans, def.nameRange, MODIFIER_DEFINITION);
}

// 3. .Values.* → property (values.yaml で解決可能か追加判定 — 将来拡張)
// 4. include/template 参照名 → string (テンプレート定義済みか追加判定 — 将来拡張)
```

### Step 4: SemanticTokensProvider に統合

```typescript
export class SemanticTokensProvider {
  provideDocumentSemanticTokens(document: TextDocument): SemanticTokens {
    const builder = new SemanticTokensBuilder();

    // Helm テンプレートのみ処理
    if (!isHelmTemplate(document)) {
      return builder.build();
    }

    const spans = tokenizeGoTemplateExpressions(document);

    // spans をソート（行 → 列の昇順）して builder に push
    spans.sort((a, b) => a.line - b.line || a.character - b.character);
    for (const span of spans) {
      builder.push(span.line, span.character, span.length, span.tokenType, span.tokenModifiers);
    }

    return builder.build();
  }
}
```

---

## 段階的リリース戦略

Phase 14B は以下の順に段階的に実装可能。各段階で独立してテスト・リリースできる。

### Stage 1: 基盤 + キーワード/演算子（最小 MVP）

| 対象 | tokenType |
|------|-----------|
| `{{ }}` / `{{- -}}` 括弧 | `operator` |
| `if`, `range`, `with`, `define`, `block`, `end`, `else` | `keyword` |
| `\|`, `:=` | `operator` |

**効果**: 制御構文がキーワード色で表示される。**最小限で最大の視覚的改善**。

### Stage 2: リテラル + 変数

| 対象 | tokenType |
|------|-----------|
| `"..."` | `string` |
| `-?\d+(\.\d+)?` | `number` |
| `$var` | `variable` |
| `{{/* ... */}}` | `comment` |

### Stage 3: Helm 固有トークン

| 対象 | tokenType | 再利用パーサー |
|------|-----------|--------------|
| `.Values.xxx` / `.Chart.xxx` / `.Release.xxx` | `property` | `findAllValuesReferences()` 等 |
| Sprig/Helm 関数 | `function` + `defaultLibrary` | `findAllHelmFunctionReferences()` |
| `include "name"` / `template "name"` | `function` + テンプレート名は `string` | `findAllTemplateReferences()` |
| `define "name"` のテンプレート名 | `string` + `definition` | `findDefineBlocks()` |

### Stage 4: 意味的強化（将来拡張）

| 対象 | 追加情報 |
|------|---------|
| `.Values.xxx` が values.yaml に存在するか | `deprecated` modifier で未定義を表現 |
| `include "name"` が定義済みか | 同上 |
| `range` 内の `.` | `variable` として明示 |

---

## テスト計画

### ユニットテスト

| ファイル | テスト内容 |
|---------|-----------|
| `test/features/goTemplateTokenizer.test.ts` | `{{ }}` ブロック検出、各トークンタイプの分類 |
| `test/providers/semanticTokensProvider.test.ts` | Provider 統合テスト、SemanticTokensBuilder 出力検証 |

### 統合テスト

| ファイル | テスト内容 |
|---------|-----------|
| `test/integration/helm-argo.test.ts` (拡張) | 実ファイルに対する semantic tokens の正当性 |

### テスト方法

```typescript
// SemanticTokensBuilder.build() の結果 data 配列を検証
// data = [deltaLine, deltaChar, length, tokenType, tokenModifiers, ...]
const result = provider.provideDocumentSemanticTokens(doc);
expect(result.data).toEqual([
  0, 0, 2, 7, 0,   // {{ → operator
  0, 3, 2, 0, 0,   // if → keyword
  0, 3, 18, 3, 0,  // .Values.enabled → property
  // ...
]);
```

---

## 影響範囲

| パッケージ | ファイル | 変更 |
|-----------|---------|------|
| `server` | `features/goTemplateTokenizer.ts` | **新規** — `{{ }}` トークナイザー |
| `server` | `providers/semanticTokensProvider.ts` | **新規** — SemanticTokensProvider |
| `server` | `server.ts` | `semanticTokensProvider` capability 登録 + ハンドラー |

**既存コードの変更なし** — 新規ファイル追加 + server.ts への登録のみ。
既存の `findAll*References()` 関数を読み取り専用で呼び出す。

---

## Neovim での動作確認

```lua
-- Neovim の LSP 設定で semantic tokens を有効化
vim.lsp.semantic_tokens.start(bufnr, client_id)

-- :Inspect で確認
-- @lsp.type.keyword → Helm キーワード（if, range 等）
-- @lsp.type.function → Sprig 関数
-- @lsp.type.property → .Values.xxx
```

Neovim 0.9+ は LSP semantic tokens をネイティブサポートしている。
