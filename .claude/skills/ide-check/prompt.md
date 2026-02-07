# IDE Diagnostics Check Skill

IDEに表示されるLSP診断エラーを確認し、false positive（誤検出）を特定する。

## 手順

### 1. IDEの診断情報を取得

```typescript
// 全ファイルの診断を取得
mcp__ide__getDiagnostics({})

// 特定ファイルの診断を取得
mcp__ide__getDiagnostics({
  uri: "file:///Users/riin/workspace/helm-yaml-lsp/samples/argo/TARGET_FILE.yaml"
})
```

### 2. エラーの分類

各診断エラーについて以下を判定:

- **正当なエラー**: 参照先が本当に存在しない → サンプルファイルの修正が必要
- **false positive（コードバグ）**: 参照先は存在するがLSPが検出できていない → ソースコード修正が必要
- **ビルド未反映**: 最近のコード修正がLSPサーバーに反映されていない → リビルド+リロードで解決

### 3. false positiveの確認方法

コードバグかビルド未反映かを切り分けるため、検証スクリプトを作成して実行:

```typescript
// 1. 関連するfeature関数を直接呼び出して動作確認
import { findTemplateDefinitions } from '@/features/templateFeatures';
import { findAllConfigMapReferences } from '@/features/configMapReferenceFeatures';

// 2. ArgoTemplateIndex / ConfigMapIndex で検索してみる
const index = new ArgoTemplateIndex();
index.setWorkspaceFolders([testDir]);
await index.initialize();
const result = await index.findTemplate(name, template, clusterScope);
```

- **関数が正しい結果を返す場合** → ビルド未反映。`bun run build` してIDEをリロード
- **関数がundefinedを返す場合** → コードバグ。修正が必要

### 4. ビルド未反映の場合の対処

```bash
bun run build
```

その後、IDEで:
- VSCode: `Cmd+Shift+P` → `Developer: Reload Window`
- 再度 `mcp__ide__getDiagnostics` で確認

### 5. コードバグの場合の対処

`/fix-diagnostic` スキルに引き継ぐ（テスト → 修正 → 検証のワークフロー）。

## 期待される結果

- `samples/argo/` 配下のサンプルファイル: 診断エラー 0件
- `samples/helm/templates/` 配下: 診断エラー 0件（`.Values.namespace` を除く）

## よくあるfalse positiveの原因

1. **YAMLインラインコメント**: `name: value  # comment` で `value  # comment` が名前として解釈される
2. **コメント行のマッチ**: `# {{inputs.parameters.xxx}}` がパラメータ参照として検出される
3. **templatesセクション終了誤判定**: コメント行がセクション終了トリガーになる
4. **context-window汚染**: 近接する異なる参照タイプが混同される → 構造的な祖先探索で解決
5. **clusterScope未検出**: `template:` 行の後に `clusterScope: true` がある場合
