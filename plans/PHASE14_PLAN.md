# Phase 14: `.tpl` ファイルサポート + language-configuration 改善 + Go template Hover/Completion

## 目的

Helm チャートの `/templates/` ディレクトリ内にある `.tpl` ファイルを
Helm テンプレートと同等に扱い、LSP 機能をフルサポートする。
また、Go テンプレート制御構文（`if`, `range`, `with`, `define`, `block`, `end`）の
Hover / Completion を追加する。

構文ハイライトは Phase 14B で Semantic Tokens として実装する（エディタ非依存）。

---

## 変更計画

### Step 1: クライアント拡張 — `.tpl` 言語認識

#### 1-1. `package.json` — `helm` 言語に `.tpl` 拡張子追加

```json
"contributes": {
  "languages": [
    {
      "id": "helm",
      "aliases": ["Helm Template", "helm"],
      "extensions": [".tpl"],
      "configuration": "./helm-language-configuration.json"
    }
  ]
}
```

**効果**: `.tpl` ファイルは自動的に `languageId: 'helm'` になる。
`.yaml` / `.yml` は静的関連付けではなく、Phase 12 の動的判定を維持。

#### 1-2. `extension.ts` — fileEvents ウォッチャー拡張

```typescript
// 変更前
fileEvents: workspace.createFileSystemWatcher('**/*.{yaml,yml}'),

// 変更後
fileEvents: workspace.createFileSystemWatcher('**/*.{yaml,yml,tpl}'),
```

### Step 2: `helm-language-configuration.json` 改善

旧拡張の `language-configuration.json` を参考に改善:

```json
{
  "comments": {
    "lineComment": "#",
    "blockComment": ["{{- /*", "*/ }}"]
  },
  "brackets": [
    ["{{", "}}"],
    ["{{-", "-}}"],
    ["{{-", "}}"],
    ["{{", "-}}"],
    ["{", "}"],
    ["[", "]"],
    ["(", ")"]
  ],
  "autoClosingPairs": [
    ["{", "}"],
    ["{{-", "-"],
    ["[", "]"],
    ["(", ")"],
    ["\"", "\""],
    ["'", "'"],
    ["`", "`"]
  ],
  "surroundingPairs": [
    ["{{", "}}"],
    ["{{-", "-}}"],
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
    ["\"", "\""],
    ["'", "'"],
    ["`", "`"]
  ],
  "folding": {
    "offSide": true
  },
  "indentationRules": {
    "increaseIndentPattern": "^\\s*.*(:|-) ?(&\\w+)?(\\{[^}\"']*|\\([^)\"']*)?$",
    "decreaseIndentPattern": "^\\s+\\}$"
  }
}
```

**追加点**:
- `blockComment` 追加（`{{- /* ... */ }}`）
- `brackets` に `{{-`/`-}}` の全4バリエーション
- `autoClosingPairs` に `{{-` → `-` 、backtick 追加
- `surroundingPairs` に Helm テンプレートバリエーション + backtick 追加

### Step 3: Go テンプレート制御構文 — Hover / Completion

#### 3-1. `features/goTemplateKeywords.ts` — キーワードカタログ（新規）

```typescript
export type GoTemplateKeyword = {
  name: string;
  syntax: string;
  description: string;
  examples: string[];
};

export const GO_TEMPLATE_KEYWORDS: readonly GoTemplateKeyword[] = [
  {
    name: 'if',
    syntax: '{{ if PIPELINE }}T1{{ else }}T0{{ end }}',
    description: 'Conditional execution. ...',
    examples: ['{{ if .Values.enabled }}...{{ end }}'],
  },
  // ... else, else if, range, with, define, block, end
];
```

#### 3-2. `references/handlers/goTemplateKeywordHandler.ts` — ハンドラー（新規）

```typescript
// ReferenceHandler を実装
// detect(): {{ if ... }}, {{ range ... }} 等のキーワード位置を検出
// resolve(): GO_TEMPLATE_KEYWORDS から説明を返す
// provideHover(): Markdown ホバーを生成
// provideCompletion(): キーワード補完候補を返す
```

**検出ロジック**: `/\{\{-?\s*(if|else\s+if|else|range|with|define|block|end)\b/`
※ `helmFunctionFeatures.ts` が既にこれらをスキップしているので競合なし。

#### 3-3. `references/setup.ts` — Helm ガードにハンドラー登録

```typescript
helmGuard: [
  helmValues, helmTemplate, helmFunction,
  chartVariable, releaseCapabilities,
  goTemplateKeyword,  // ← 追加（最低優先順位）
]
```

---

## サーバー側の変更不要箇所（確認済み）

| ファイル | 理由 |
|---------|------|
| `documentDetection.ts` | `languageId === 'helm'` → 即 `true`。`.tpl` は `helm` になるので対応済み |
| `server.ts` | `TextDocuments` は全ドキュメントを受信。ファイルウォッチは既に `.tpl` を含む |
| `helmTemplateIndex.ts` | 既に `.tpl` ファイルをスキャン対象に含む |

---

## テスト計画

### ユニットテスト

| ファイル | テスト内容 |
|---------|-----------|
| `test/features/goTemplateKeywords.test.ts` | キーワードカタログの正当性 |
| `test/references/handlers/goTemplateKeywordHandler.test.ts` | detect / resolve / hover / completion |

### 統合テスト

| ファイル | テスト内容 |
|---------|-----------|
| `test/integration/helm-argo.test.ts` (拡張) | `_helpers.tpl` を開いて Definition / Hover が動作するか |

---

## 影響範囲

| パッケージ | ファイル | 変更 |
|-----------|---------|------|
| `vscode-client` | `package.json` | `extensions: [".tpl"]` 追加 |
| `vscode-client` | `src/extension.ts` | `fileEvents` に `.tpl` 追加 |
| `vscode-client` | `helm-language-configuration.json` | 全面改善 |
| `server` | `features/goTemplateKeywords.ts` | **新規** — キーワードカタログ |
| `server` | `references/handlers/goTemplateKeywordHandler.ts` | **新規** — ハンドラー |
| `server` | `references/setup.ts` | Helm ガードにハンドラー追加 |
| `server` | `references/types.ts` | `ReferenceKind` に `GoTemplateKeyword` 追加 |
