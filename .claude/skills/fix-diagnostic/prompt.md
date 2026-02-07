# Fix Diagnostic Skill

LSP診断のfalse positive（誤検出）を修正する。**テスト先行（TDD）**アプローチを厳守する。

## ワークフロー

### Phase 1: 問題の特定

1. IDEの診断エラーメッセージから、どのfeature関数が原因か特定する
2. エラーのパターンを分類:
   - **Template not found**: `findTemplateDefinitions` or `findAllTemplateReferences`
   - **ConfigMap/Secret not found**: `findAllConfigMapReferences` or `ConfigMapIndex`
   - **Parameter not found**: `findAllParameterReferences`
   - **Key not found**: `ConfigMapIndex.findKey`

### Phase 2: テスト作成（修正より先に必ず実行）

**バグを再現するテストケースを先に書く。**

既存テストファイルにケースを追加するか、新規テストファイルを作成:

```typescript
it('should handle [問題のパターン]', () => {
  const yaml = `
  // バグが発生する最小限のYAML
  `;
  const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, yaml);
  const result = targetFunction(doc);
  expect(result).toSatisfy(/* 期待される正しい動作 */);
});
```

テストを実行して**失敗することを確認**:
```bash
bun run test packages/server/test/path/to/test.ts
```

### Phase 3: 修正

テストが失敗する状態で、ソースコードを修正する。

**修正対象ファイルの場所**:
- Features: `packages/server/src/features/`
  - `templateFeatures.ts` - テンプレート定義・参照検出
  - `configMapReferenceFeatures.ts` - ConfigMap/Secret参照検出
  - `configMapFeatures.ts` - ConfigMap/Secret定義検出
  - `parameterFeatures.ts` - パラメータ参照検出
- Services: `packages/server/src/services/`
  - `argoTemplateIndex.ts` - テンプレートインデックス
  - `configMapIndex.ts` - ConfigMap/Secretインデックス
- Providers: `packages/server/src/providers/`
  - `diagnosticProvider.ts` - 診断ロジック

### Phase 4: 検証

```bash
# 新テストがパスすることを確認
bun run test packages/server/test/path/to/test.ts

# 全テストがパスすることを確認（リグレッションチェック）
bun run test

# ビルド（IDEに反映するため）
bun run build
```

## 複数の独立したバグがある場合

独立した問題はチームオーケストレーションで並列に修正する:

```
チーム構成例:
- agent-1: templateFeaturesのバグ修正（テスト作成→修正→検証）
- agent-2: configMapReferenceFeaturesのバグ修正（テスト作成→修正→検証）
```

各エージェントが異なるファイルを修正するため、コンフリクトなく並列実行できる。

## YAML解析でよくあるバグパターンと修正方法

### 1. インラインコメントの除去漏れ
```yaml
name: my-config  # this is a comment
```
**修正**: `stripYamlInlineComment()` を適用。クォート内の `#` は除外する。

### 2. コメント行の誤マッチ
```yaml
# {{inputs.parameters.name}} を使う
```
**修正**: `line.trim().startsWith('#')` でコメント行をスキップ。

### 3. YAMLセクション終了の誤判定
```yaml
templates:
  # このコメントでセクションが終了してしまう
  - name: my-template
```
**修正**: `!line.trim().startsWith('#')` の条件を追加。

### 4. 上方探索での兄弟ブランチ混入
```yaml
configMapKeyRef:         # ← これを拾いたいが
  name: my-config
  key: my-key
secretKeyRef:            # ← これが近接していると混同される
  name: my-secret
  key: secret-key
```
**修正**: context-windowアプローチを構造的祖先探索（`findAncestorReferenceType`）に置き換え。
各祖先のインデントが厳密に減少することを検証する。

### 5. templateRefブロックの不完全なスキャン
```yaml
templateRef:
  name: my-template
  template: hello
  clusterScope: true     # ← template: 行の後にあると見落とす
```
**修正**: スキャンをブロック全体（indent が戻るまで）に拡張する。
