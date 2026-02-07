# Phase 8: Artifact参照サポート

## 目的

`{{inputs.artifacts.xxx}}`, `{{outputs.artifacts.xxx}}`, `{{steps.xxx.outputs.artifacts.yyy}}`, `{{tasks.xxx.outputs.artifacts.yyy}}` の検出・定義ジャンプ・ホバー・補完・診断を実装。

## 背景

- 型定義は既に存在: `ArtifactDefinition` (`src/types/argo.ts` L108-127)
- `ParameterReference.type` にartifact型が定義済み (`src/types/argo.ts` L63-72) だが検出ロジックが未実装
- 旧コードの検出パターン: `vscode-kubernetes-tools-argo/src/parameter-features.ts`

## 設計方針

既存の `argoParameterHandler` を拡張する（旧コードも同一型で統一処理）。新ファイルは作らず、既存コードの拡張で対応。

---

## Step 8.1: parameterFeatures.ts にartifact検出を追加

**変更ファイル**: `packages/server/src/features/parameterFeatures.ts`

### 8.1.1: findParameterReferenceAtPosition に追加するパターン

```typescript
// 既存の patterns 配列に追加:
{
  regex: /\{\{inputs\.artifacts\.([\w-]+)\}\}/g,
  type: 'inputs.artifacts' as const,
},
{
  regex: /\{\{outputs\.artifacts\.([\w-]+)\}\}/g,
  type: 'outputs.artifacts' as const,
},
{
  regex: /\{\{steps\.([\w-]+)\.outputs\.artifacts\.([\w-]+)\}\}/g,
  type: 'steps.outputs.artifacts' as const,
},
{
  regex: /\{\{tasks\.([\w-]+)\.outputs\.artifacts\.([\w-]+)\}\}/g,
  type: 'tasks.outputs.artifacts' as const,
},
```

注意: steps/tasks パターンでは match[1] がステップ/タスク名、match[2] がアーティファクト名。既存の steps.outputs.parameters と同じハンドリング。

### 8.1.2: findAllParameterReferences に同じパターンを追加

既存の patterns 配列に同様の4パターンを追加。

### 8.1.3: findArtifactDefinitions 新規関数

`inputs.artifacts[]` と `outputs.artifacts[]` を走査してアーティファクト定義を返す関数。

```typescript
export function findArtifactDefinitions(document: TextDocument): ArtifactDefinition[] {
  // inputs: → artifacts: → - name: xxx セクションを走査
  // outputs: → artifacts: → - name: xxx セクションを走査
  // path: フィールドも抽出
}
```

走査ロジックは `findParameterDefinitions()` と同じパターン（インデントベースのセクション追跡）。
`artifacts:` セクションを `parameters:` の代わりに検出する。

---

## Step 8.2: references/types.ts の ArgoParameterDetails 拡張

**変更ファイル**: `packages/server/src/references/types.ts`

```typescript
export type ArgoParameterDetails = {
  kind: 'argoParameter';
  type:
    | 'inputs.parameters' | 'outputs.parameters'
    | 'workflow.parameters'
    | 'steps.outputs.parameters' | 'tasks.outputs.parameters'
    // 追加:
    | 'inputs.artifacts' | 'outputs.artifacts'
    | 'steps.outputs.artifacts' | 'tasks.outputs.artifacts';
  parameterName: string;
  stepOrTaskName?: string;
};
```

---

## Step 8.3: argoParameterHandler.ts にartifact解決を追加

**変更ファイル**: `packages/server/src/references/handlers/argoParameterHandler.ts`

### 8.3.1: detect() の supportedTypes に追加

```typescript
const supportedTypes = [
  'inputs.parameters', 'outputs.parameters', 'workflow.parameters',
  'steps.outputs.parameters', 'tasks.outputs.parameters',
  // 追加:
  'inputs.artifacts', 'outputs.artifacts',
  'steps.outputs.artifacts', 'tasks.outputs.artifacts',
];
```

### 8.3.2: resolve() の switch に追加

```typescript
case 'inputs.artifacts':
case 'outputs.artifacts':
  return resolveInputOutputArtifact(doc, detected, details);
case 'steps.outputs.artifacts':
  return resolveStepOutputArtifact(doc, detected, details);
case 'tasks.outputs.artifacts':
  return resolveTaskOutputArtifact(doc, detected, details);
```

### 8.3.3: 解決関数の実装

**resolveInputOutputArtifact()**: テンプレート内 `inputs.artifacts[]` / `outputs.artifacts[]` からアーティファクト定義を検索。

ホバーMarkdown:
```
**Input Artifact**: `my-file`
**Path**: `/tmp/data.txt`
Defined in template `prepare-data`
```

**resolveStepOutputArtifact()**: ステップ参照テンプレートの `outputs.artifacts[]` から検索。`resolveStepOutputParameter()` と同じパターンで `findArtifactDefinitions()` を使用。

**resolveTaskOutputArtifact()**: タスク参照テンプレートの同上。

### 8.3.4: findAll() にartifactパターンを追加

```typescript
findAll(doc: TextDocument): DetectedReference[] {
  const refs = findAllParameterReferences(doc);
  return refs
    .filter(ref =>
      ref.type === 'inputs.parameters' || ref.type === 'outputs.parameters' ||
      ref.type === 'inputs.artifacts' || ref.type === 'outputs.artifacts'
    )
    .map(ref => ({ ... }));
},
```

### 8.3.5: complete() にartifact補完を追加

```typescript
// 既存の context 判定に追加:
if (/\{\{inputs\.artifacts\.\w*/.test(linePrefix)) {
  context = 'inputs.artifacts';
} else if (/\{\{outputs\.artifacts\.\w*/.test(linePrefix)) {
  context = 'outputs.artifacts';
}

// artifacts の場合は findArtifactDefinitions() を使用
```

---

## Step 8.4: テスト

### 8.4.1: parameterFeatures.test.ts にartifact検出テスト追加

**変更ファイル**: `packages/server/test/features/parameterFeatures.test.ts`

追加テスト:
- `findParameterReferenceAtPosition` describe 内:
  - `should find inputs.artifacts reference`
  - `should find outputs.artifacts reference`
  - `should find steps.outputs.artifacts reference`
  - `should find tasks.outputs.artifacts reference`
- `findAllParameterReferences` describe 内:
  - `should find all artifact references`
  - `should skip artifact references in comments`
- `findArtifactDefinitions` describe (新規):
  - `should find input artifact definitions`
  - `should find output artifact definitions with path`
  - `should find artifacts in multiple templates`

### 8.4.2: argoParameterHandler.test.ts (新規)

**新規ファイル**: `packages/server/test/references/argoParameterHandler.test.ts`

テスト:
- `should resolve input artifact reference` — ホバー内容とdefinition位置
- `should resolve output artifact reference` — path付き
- `should resolve step output artifact reference`
- `should resolve task output artifact reference`
- `should provide artifact completion`
- `should return not-found for unknown artifact`

---

## 推定テスト増: +15〜20

## 検証

```bash
bun run test          # 全テストパス確認
bun run check         # 型チェック + Biome
bun run build         # LSPビルド
```
