# Phase 15B: RenderedArgoIndexCache — Cross-document templateRef 解決の強化

## 背景

Phase 15 では、レンダリング済み YAML に対して既存の ReferenceRegistry を適用し、Argo 意味解決を実現した。
しかし、templateRef による cross-document 参照（別ファイルの WorkflowTemplate を参照）は、ArgoTemplateIndex にインデックスされたワークスペース内のファイルに限られる。

Helm チャート内で WorkflowTemplate も Helm テンプレートとして定義されている場合、ソースファイルには `{{ }}` が含まれるため ArgoTemplateIndex に正しくインデックスされない可能性がある。Phase 13 の診断パイプラインでは、チャート全体をレンダリングして一時 ArgoTemplateIndex を構築することでこの問題を解決している。

Phase 15B では、このパターンを Definition/Hover にも適用し、レンダリング済みチャート全体からの cross-document templateRef 解決を実現する。

## 設計

### RenderedArgoIndexCache サービス（新規）

`packages/server/src/services/renderedArgoIndexCache.ts`

```typescript
type CacheEntry = {
  argoIndex: ArgoTemplateIndex;
  registry: ReferenceRegistry;
  renderOutput: string; // キャッシュ一致判定用のハッシュ
  createdAt: number;
};

export class RenderedArgoIndexCache {
  private cache: Map<string, CacheEntry> = new Map(); // key: chartDir

  constructor(
    private helmTemplateExecutor: HelmTemplateExecutor,
    private configMapIndex?: ConfigMapIndex
  ) {}

  /**
   * チャートのレンダリング結果から構築した ArgoOnlyRegistry を取得
   * HelmTemplateExecutor のキャッシュ（5分TTL）を活用し、
   * レンダリング結果が同じであれば既存の ArgoTemplateIndex を再利用
   */
  async getRegistry(chartDir: string): Promise<ReferenceRegistry | null> {
    // 1. helmTemplateExecutor.renderChart(chartDir) でレンダリング
    // 2. 出力ハッシュが前回と同じならキャッシュ済み registry を返す
    // 3. 変わっていたら:
    //    a. 新しい ArgoTemplateIndex を構築
    //    b. 全レンダリング済みドキュメントを indexDocument()
    //    c. createArgoOnlyRegistry(tempIndex, configMapIndex)
    //    d. キャッシュに保存
    // 4. registry を返す
  }

  invalidate(chartDir?: string): void {
    if (chartDir) {
      this.cache.delete(chartDir);
    } else {
      this.cache.clear();
    }
  }

  clear(): void {
    this.cache.clear();
  }
}
```

### Provider の変更

DefinitionProvider / HoverProvider の rendered YAML 処理フロー:

```
isRenderedYaml?
  → Step 1: 既存 registry で Argo 解決（Phase 15、ローカル参照）
  → Step 2: RenderedArgoIndexCache で cross-document 解決（Phase 15B）
  → Step 3: symbolMapping フォールバック
```

### 定義ジャンプ先のマッピング

RenderedArgoIndexCache のレジストリは、レンダリング済みドキュメントに `file:///rendered/templates/xxx.yaml` のような仮想 URI を使用する（Phase 13 の diagnosticProvider と同じパターン）。

定義ジャンプ先が仮想 URI の場合:
1. `templates/xxx.yaml` パスを抽出
2. `chartDir + '/' + templatePath` で実ファイルパスを構築
3. symbolMappingIndex でレンダリング済みの行 → 元テンプレートの行にマッピング
4. 実ファイルの Location を返す

## Phase 13 との共通化

DiagnosticProvider（Phase 13）で構築している一時 ArgoTemplateIndex と同じロジックを RenderedArgoIndexCache に抽出し、診断と definition/hover で共有する:

```
現在 (Phase 13):
  DiagnosticProvider.provideRenderedDiagnostics()
    → new ArgoTemplateIndex() + indexDocument() + createArgoOnlyRegistry()

改善後 (Phase 15B):
  RenderedArgoIndexCache.getRegistry(chartDir)
    → キャッシュ付きの ArgoTemplateIndex + ArgoOnlyRegistry

  DiagnosticProvider → renderedArgoIndexCache.getRegistry(chartDir)
  DefinitionProvider → renderedArgoIndexCache.getRegistry(chartDir)
  HoverProvider      → renderedArgoIndexCache.getRegistry(chartDir)
```

## パフォーマンス考慮

- `HelmTemplateExecutor.renderChart()` は既に 5分TTL のキャッシュあり
- `RenderedArgoIndexCache` は renderChart の出力が同じであれば ArgoTemplateIndex を再構築しない
- ArgoTemplateIndex の構築はインメモリ操作のみ（ファイルI/O なし）で高速
- Definition/Hover のインタラクティブ性を損なわない

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `packages/server/src/services/renderedArgoIndexCache.ts` | 新規: キャッシュサービス |
| `packages/server/src/providers/definitionProvider.ts` | RenderedArgoIndexCache 経由の解決追加 |
| `packages/server/src/providers/hoverProvider.ts` | RenderedArgoIndexCache 経由の解決追加 |
| `packages/server/src/providers/diagnosticProvider.ts` | 一時 index 構築を RenderedArgoIndexCache に移行 |
| `packages/server/src/server.ts` | RenderedArgoIndexCache インスタンス生成 + Provider への注入 |
| `packages/server/test/services/renderedArgoIndexCache.test.ts` | 新規: キャッシュサービスのテスト |

## 前提条件

- Phase 15 が完了していること（rendered YAML → registry → フォールバック の基本フロー）
- helm CLI がインストールされていること（renderChart に必要）
