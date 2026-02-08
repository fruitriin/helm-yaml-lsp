# Phase 10: Item変数サポート

## 目的

`{{item}}` と `{{item.xxx}}` の検出・定義ジャンプ（withItems/withParamソースへ）・ホバー・補完を実装。

## 背景

- 型定義は既に存在: `ItemVariableReference` (`src/types/argo.ts` L247-254), `ItemSourceDefinition` (L259-274), `ItemValue` (L279-286)
- 完全に新しい参照種別 → 新しいReferenceHandlerが必要
- `{{item}}` は `withItems` / `withParam` を持つステップ/タスク内で有効
- `{{item.xxx}}` はオブジェクト配列の場合にプロパティアクセス

---

## Step 10.1: 新規 features ファイル

**新規ファイル**: `packages/server/src/features/itemVariableFeatures.ts`

### findItemVariableAtPosition(doc, pos)

カーソル位置にある `{{item}}` / `{{item.xxx}}` を検出。

```typescript
export function findItemVariableAtPosition(
  document: TextDocument,
  position: Position
): ItemVariableReference | undefined {
  const line = lines[position.line];

  // パターン1: {{item.xxx}}
  const propertyPattern = /\{\{item\.([\w-]+)\}\}/g;
  // パターン2: {{item}}
  const itemPattern = /\{\{item\}\}/g;

  // propertyPattern を先にチェック（item.xxx は item より具体的）
  // matchStart <= pos.character <= matchEnd なら返す
}
```

### findItemSourceDefinition(doc, pos)

カーソル位置のステップ/タスク範囲内で `withItems:` / `withParam:` を検索。

```typescript
export function findItemSourceDefinition(
  document: TextDocument,
  position: Position
): ItemSourceDefinition | undefined {
  // 1. カーソル位置を含むステップ/タスクブロックを特定
  //    - `- name:` の行を上方向に検索
  //    - そのブロック内で withItems: / withParam: を検索
  // 2. withItems: の場合は値を解析
  // 3. withParam: の場合は式を抽出
}
```

### findEnclosingStepOrTask(lines, lineNum)

カーソル位置を含むステップ/タスクのブロック範囲を返す。

```typescript
function findEnclosingStepOrTask(
  lines: string[],
  lineNum: number
): { startLine: number; endLine: number; indent: number } | undefined {
  // lineNum から上方向に `- name:` を検索
  // そのインデントレベルより深い行が続く範囲を返す
}
```

### parseWithItemsValues(lines, startLine)

withItems 配列の値を解析。

```typescript
export function parseWithItemsValues(
  lines: string[],
  startLine: number
): ItemValue[] {
  // withItems: の次の行からインデントが深い - xxx 要素を解析
  // インライン形式: withItems: ["a", "b", "c"]
  // 複数行形式:
  //   withItems:
  //     - "a"
  //     - "b"
  //     - {name: "foo", value: "bar"}
  //
  // オブジェクト要素の場合は properties を抽出
}
```

---

## Step 10.2: 新規ハンドラー

**新規ファイル**: `packages/server/src/references/handlers/itemVariableHandler.ts`

```typescript
export function createItemVariableHandler(): ReferenceHandler {
  return {
    kind: 'itemVariable',
    supports: {
      definition: true,
      hover: true,
      completion: true,
      diagnostic: false, // item参照の存在チェックは複雑なので診断は行わない
    },

    detect(doc, pos): DetectedReference | undefined {
      const ref = findItemVariableAtPosition(doc, pos);
      if (!ref) return undefined;
      return {
        kind: 'itemVariable',
        range: ref.range,
        details: {
          kind: 'itemVariable',
          type: ref.type,
          propertyName: ref.propertyName,
        },
      };
    },

    async resolve(doc, detected): Promise<ResolvedReference> {
      const details = detected.details as ItemVariableDetails;
      const source = findItemSourceDefinition(doc, /* detected.range の行位置 */);

      if (!source) {
        return { detected, definitionLocation: null, hoverMarkdown: null, diagnosticMessage: null, exists: null };
      }

      // 定義ジャンプ: withItems/withParam の行
      const definitionLocation = { uri: doc.uri, range: source.range };

      // ホバー構築
      const hoverParts: string[] = [];
      if (source.type === 'withItems') {
        hoverParts.push(`**Item Variable**: \`{{item${details.propertyName ? '.' + details.propertyName : ''}}}\``);
        hoverParts.push('');
        hoverParts.push(`**Source**: \`withItems\``);
        if (source.items && source.items.length > 0) {
          const maxShow = 5;
          const shown = source.items.slice(0, maxShow);
          hoverParts.push('**Values**:');
          for (const item of shown) {
            hoverParts.push(`- \`${item.value}\``);
          }
          if (source.items.length > maxShow) {
            hoverParts.push(`- ... and ${source.items.length - maxShow} more`);
          }
          // オブジェクト型の場合はプロパティ列挙
          if (source.items[0].valueType === 'object' && source.items[0].properties) {
            hoverParts.push('');
            hoverParts.push(`**Available properties**: ${source.items[0].properties.map(p => '`' + p + '`').join(', ')}`);
          }
        }
      } else {
        // withParam
        hoverParts.push(`**Item Variable**: \`{{item${details.propertyName ? '.' + details.propertyName : ''}}}\``);
        hoverParts.push('');
        hoverParts.push(`**Source**: \`withParam\``);
        if (source.paramExpression) {
          hoverParts.push(`**Expression**: \`${source.paramExpression}\``);
        }
      }

      return {
        detected,
        definitionLocation,
        hoverMarkdown: hoverParts.join('\n'),
        diagnosticMessage: null,
        exists: true,
      };
    },

    complete(doc, pos): CompletionItem[] | undefined {
      const line = lines[pos.line];
      const linePrefix = line.substring(0, pos.character);

      if (!/\{\{item\.\w*/.test(linePrefix)) return undefined;

      // withItems のソースからオブジェクトプロパティを補完
      const source = findItemSourceDefinition(doc, pos);
      if (!source || source.type !== 'withItems') return undefined;
      if (!source.items || source.items.length === 0) return undefined;

      const firstItem = source.items[0];
      if (firstItem.valueType !== 'object' || !firstItem.properties) return undefined;

      return firstItem.properties.map(prop => ({
        label: prop,
        kind: CompletionItemKind.Property,
        detail: 'Item Property',
        insertText: prop,
      }));
    },
  };
}
```

---

## Step 10.3: types.ts 拡張

**変更ファイル**: `packages/server/src/references/types.ts`

### ReferenceKind に追加

```typescript
export type ReferenceKind =
  | 'argoTemplate'
  | 'argoParameter'
  | 'workflowVariable'
  | 'configMap'
  | 'helmValues'
  | 'helmTemplate'
  | 'helmFunction'
  | 'chartVariable'
  | 'releaseCapabilities'
  | 'itemVariable';  // 追加
```

### ItemVariableDetails 型追加

```typescript
export type ItemVariableDetails = {
  kind: 'itemVariable';
  type: 'item' | 'item.property';
  propertyName?: string;
};
```

### ReferenceDetails 判別共用体に追加

```typescript
export type ReferenceDetails =
  | ArgoTemplateDetails
  | ArgoParameterDetails
  | WorkflowVariableDetails
  | ConfigMapDetails
  | HelmValuesDetails
  | HelmTemplateDetails
  | HelmFunctionDetails
  | ChartVariableDetails
  | ReleaseCapabilitiesDetails
  | ItemVariableDetails;  // 追加
```

---

## Step 10.4: setup.ts にハンドラー登録

**変更ファイル**: `packages/server/src/references/setup.ts`

Argo ガードの handlers 配列に `createItemVariableHandler()` を追加:

```typescript
import { createItemVariableHandler } from './handlers/itemVariableHandler';

// Phase 3: Argo guard
const argoTemplateHandler = createArgoTemplateHandler(_argoTemplateIndex);
const argoParameterHandler = createArgoParameterHandler();
const workflowVariableHandler = createWorkflowVariableHandler();
const itemVariableHandler = createItemVariableHandler();  // 追加
registry.addGuard({
  name: 'argo',
  check: doc => isArgoWorkflowDocument(doc),
  handlers: [argoTemplateHandler, argoParameterHandler, workflowVariableHandler, itemVariableHandler],
});
```

---

## Step 10.5: テスト

### test/features/itemVariableFeatures.test.ts (新規)

- `findItemVariableAtPosition`:
  - `should detect {{item}} reference`
  - `should detect {{item.name}} property reference`
  - `should return undefined for non-item position`
  - `should handle multiple item references on same line`
- `findItemSourceDefinition`:
  - `should find withItems source`
  - `should find withParam source`
  - `should return undefined when no withItems/withParam`
- `parseWithItemsValues`:
  - `should parse string array`
  - `should parse number array`
  - `should parse object array with properties`
  - `should parse inline array format`

### test/references/itemVariableHandler.test.ts (新規)

- `should resolve item variable with withItems source`
- `should resolve item.property with object withItems`
- `should resolve item with withParam source`
- `should provide property completion for object items`
- `should return null for item outside withItems/withParam context`

---

## 推定テスト増: +15〜20

## 検証

```bash
bun run test          # 全テストパス確認
bun run check         # 型チェック + Biome
bun run build         # LSPビルド
```
