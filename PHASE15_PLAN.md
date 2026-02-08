# Phase 15: レンダリング済み YAML の Definition/Hover を argoRegistry 経由に統合

## 背景

レンダリング済み YAML（`helm template` 出力）に対する Definition/Hover は、Phase 7 で `symbolMappingIndex` による「元テンプレートへのソース位置マッピング」のみを実装していた。しかし、レンダリング済み YAML は「クリーンな Argo YAML」であり、既存の Argo ハンドラー（テンプレート参照、パラメータ、変数等）で意味的な解決が可能。

Phase 15 では、プロバイダーの短絡処理を変更し、既存の `ReferenceRegistry` を rendered YAML にも適用することで、ユーザーが Argo の意味情報（テンプレート定義、パラメータ型・デフォルト値等）を得られるようにする。

## 具体例

- `template: build-image` を Ctrl+クリック → 改善前: ソース行にジャンプ → **改善後**: テンプレート定義 `- name: build-image` にジャンプ
- `template: build-image` にホバー → 改善前: "Source: templates/xxx.yaml, Line: 42" → **改善後**: "**Template**: `build-image`, **Location**: Local template in current Workflow"

## 技術的根拠

既存の registry のガードは rendered YAML にすでにマッチする:
- `isHelmTemplate()` → false（languageId='yaml', /templates/ 外 or Chart.yaml なし）
- `isArgoWorkflowDocument()` → true（Argo apiVersion/kind あり）
- Argo ガード条件 `isArgoWorkflowDocument(doc) && !isHelmTemplate(doc)` → true

Argo 式 `{{inputs.parameters.message}}` は `HELM_TEMPLATE_SYNTAX_REGEX` (`/\{\{-?\s/`) にマッチしない（スペースなし）ため、`isRenderedYaml()` も正しく true を返す。

## 実装内容

### DefinitionProvider の変更

`packages/server/src/providers/definitionProvider.ts`

```
変更前:
  isRenderedYaml? → handleRenderedYamlDefinition() (symbolMapping のみ)

変更後:
  isRenderedYaml? → registry.detectAndResolve() 試行
                    → 成功: Argo 定義位置を返す
                    → 失敗: handleRenderedYamlDefinition() にフォールバック
```

### HoverProvider の変更

`packages/server/src/providers/hoverProvider.ts`

```
変更前:
  isRenderedYaml? → handleRenderedYamlHover() (Helm式情報 / ソース位置のみ)

変更後:
  isRenderedYaml? → registry.detectAndResolve() 試行
                    → 成功: Argo 意味ホバーを返す
                    → 失敗: handleRenderedYamlHover() にフォールバック
```

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `packages/server/src/providers/definitionProvider.ts` | Argo registry 試行 + フォールバック |
| `packages/server/src/providers/hoverProvider.ts` | Argo registry 試行 + フォールバック |
| `packages/server/test/providers/definitionProvider.test.ts` | Phase 15 テストケース追加 |
| `packages/server/test/providers/hoverProvider.test.ts` | Phase 15 テストケース追加 |

変更しないファイル: `references/setup.ts`, `references/registry.ts`, `references/handlers/*`, `server.ts`（既存 registry がそのまま動作するため）

## 対応した参照タイプ

| 参照タイプ | rendered YAML での動作 |
|-----------|----------------------|
| ローカルテンプレート (`template: xxx`) | 同一ドキュメント内の定義にジャンプ / ホバー |
| templateRef (cross-document) | ArgoTemplateIndex にインデックス済みの WT/CWT を解決 |
| パラメータ (`{{inputs.parameters.xxx}}`) | 定義にジャンプ / 型・デフォルト値ホバー |
| ワークフロー変数 (`{{workflow.name}}`) | 変数説明ホバー |
| Item 変数 (`{{item}}`) | withItems/withParam ソース検出 |
| ConfigMap/Secret 参照 | 定義ジャンプ / ホバー |

## 影響範囲

- リスク低: フォールバック付きの変更。Argo 解決が失敗しても既存動作に戻る
- パフォーマンス影響なし: `detectAndResolve()` はテキスト解析のみ（I/O なし）
- 既存テストへの影響なし: 非 rendered YAML のフローは変更なし
