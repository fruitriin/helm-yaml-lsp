# Phase 9: Script Result & Workflow Outputs

## 目的

`{{steps.xxx.outputs.result}}`, `{{tasks.xxx.outputs.result}}`,
`{{workflow.outputs.parameters.xxx}}`, `{{workflow.outputs.artifacts.xxx}}` のサポート。

## 背景

- `ScriptResultDefinition` 型は既に定義済み (`src/types/argo.ts` L132-145)
- `ParameterReference.type` に `steps.outputs.result`, `tasks.outputs.result` が定義済みだが検出ロジック未実装
- `outputs.result` はscriptテンプレートでのみ有効（stdout最終行をキャプチャ）
- `workflow.outputs.parameters/artifacts` はトップレベルWorkflowの出力参照

---

## Step 9.1: result検出の追加

**変更ファイル**: `packages/server/src/features/parameterFeatures.ts`

### 9.1.1: findParameterReferenceAtPosition の patterns に追加

```typescript
{
  regex: /\{\{steps\.([\w-]+)\.outputs\.result\}\}/g,
  type: 'steps.outputs.result' as const,
},
{
  regex: /\{\{tasks\.([\w-]+)\.outputs\.result\}\}/g,
  type: 'tasks.outputs.result' as const,
},
```

注意: `result` は固定キーワードなのでパラメータ名は不要。ただし `ParameterReference` 型の `parameterName` には `'result'` をセット。`match[1]` がステップ/タスク名。

### 9.1.2: findAllParameterReferences にresultパターン追加

同じ2パターンを追加。

### 9.1.3: findScriptDefinitionInTemplate 新規関数

```typescript
export function findScriptDefinitionInTemplate(
  lines: string[],
  templateRange: { start: number; end: number }
): { scriptLine: number; language?: string } | undefined {
  // templateRange 内で `script:` セクションを検索
  // `command:` の最初の要素から言語を推測 (python, bash, sh, etc.)
  // `image:` からも推測可能 (python:3.9 → python)
}
```

---

## Step 9.2: references/types.ts 拡張

**変更ファイル**: `packages/server/src/references/types.ts`

ArgoParameterDetails.type に追加:

```typescript
| 'steps.outputs.result' | 'tasks.outputs.result'
```

---

## Step 9.3: argoParameterHandler.ts にresult解決を追加

**変更ファイル**: `packages/server/src/references/handlers/argoParameterHandler.ts`

### 9.3.1: detect() の supportedTypes に追加

```typescript
'steps.outputs.result', 'tasks.outputs.result',
```

### 9.3.2: resolve() の switch に追加

```typescript
case 'steps.outputs.result':
  return resolveStepOutputResult(doc, detected, details);
case 'tasks.outputs.result':
  return resolveTaskOutputResult(doc, detected, details);
```

### 9.3.3: resolveStepOutputResult()

ステップ参照テンプレートの `script:` セクションを検索。

処理フロー:
1. `findStepDefinitions()` でステップを検索
2. ステップの `templateName` に対応するテンプレートを `findTemplateDefinitions()` で検索
3. テンプレート範囲内で `script:` セクションを検索
4. 言語情報を抽出

ホバーMarkdown:
```
**Script Result**: `outputs.result`
**Step**: `run-script`
**Template**: `my-script-template`
**Language**: `python`

*The `result` output captures the last line of stdout*
```

定義ジャンプ: `script:` セクションの位置

### 9.3.4: resolveTaskOutputResult()

タスク版。`findTaskDefinitions()` を使用して同じロジック。

### 9.3.5: findAll() のフィルターに追加

```typescript
ref.type === 'steps.outputs.result' || ref.type === 'tasks.outputs.result'
```

は診断対象外（resultの存在チェックはscriptテンプレート有無で判断）なので、findAll には追加しない。

---

## Step 9.4: workflow.outputs のサポート

### 9.4.1: workflowVariables.ts の拡張

**変更ファイル**: `packages/server/src/features/workflowVariables.ts`

`findWorkflowVariableAtPosition()` で `workflow.outputs.parameters.xxx` と `workflow.outputs.artifacts.xxx` を検出できるようにする。

現在の処理フロー:
1. `{{workflow.xxx.yyy.zzz}}` をキャプチャ
2. `parts[1]` が `parameters`/`labels`/`annotations` の場合にサブプロパティ処理

追加ロジック:
```typescript
// workflow.outputs.parameters.xxx → subPropertyType: 'outputs.parameters'
if (parts.length >= 4 && parts[1] === 'outputs') {
  if (parts[2] === 'parameters') {
    return {
      variable: {
        name: variableName,
        description: `Workflow output parameter: \`${parts.slice(3).join('.')}\``,
        example: `{{${variableName}}}`,
      },
      range,
    };
  }
  if (parts[2] === 'artifacts') {
    return {
      variable: {
        name: variableName,
        description: `Workflow output artifact: \`${parts.slice(3).join('.')}\``,
        example: `{{${variableName}}}`,
      },
      range,
    };
  }
}
```

### 9.4.2: workflowVariableHandler.ts の拡張

**変更ファイル**: `packages/server/src/references/handlers/workflowVariableHandler.ts`

`WorkflowVariableDetails.subPropertyType` に新しい値を追加:

```typescript
// types.ts の WorkflowVariableDetails:
subPropertyType?: 'labels' | 'annotations' | 'parameters' | 'outputs.parameters' | 'outputs.artifacts';
```

detect() で subPropertyType の判定を追加:
```typescript
if (parts[1] === 'outputs' && parts[2] === 'parameters') {
  subProperty = parts.slice(3).join('.');
  subPropertyType = 'outputs.parameters';
} else if (parts[1] === 'outputs' && parts[2] === 'artifacts') {
  subProperty = parts.slice(3).join('.');
  subPropertyType = 'outputs.artifacts';
}
```

resolve() で workflow.outputs の定義位置を検索:
- `outputs.parameters` → ドキュメント内の `spec.arguments` 内の表記を検索（Argo Workflows の `workflow.outputs.parameters.xxx` は実際には DAGTemplate の `outputs.parameters` から参照される）
- 定義ジャンプはベストエフォート: ドキュメント内で該当パラメータ/アーティファクト名を検索

---

## Step 9.5: テスト

### parameterFeatures.test.ts に追加

- `should find steps.outputs.result reference`
- `should find tasks.outputs.result reference`
- `should find result references in findAllParameterReferences`

### argoParameterHandler.test.ts に追加

- `should resolve step output result` — script言語の検出、ホバー内容
- `should resolve task output result` — 同上
- `should return null for result when no script template`

### workflowVariables.test.ts に追加

- `should detect workflow.outputs.parameters.xxx`
- `should detect workflow.outputs.artifacts.xxx`

### workflowVariableHandler.test.ts に追加

- `should resolve workflow.outputs.parameters reference`
- `should resolve workflow.outputs.artifacts reference`

---

## 推定テスト増: +10〜15

## 検証

```bash
bun run test          # 全テストパス確認
bun run check         # 型チェック + Biome
bun run build         # LSPビルド
```
