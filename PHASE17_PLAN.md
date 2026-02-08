# Phase 17: values.yaml バリエーション診断（Chart.yaml アノテーション）

## 背景

現在、`helm template` の実行は固定引数 (`releaseName` のみカスタマイズ可) で行われる。実際の Helm 運用では `--set`, `--values`, `--namespace` 等のオーバーライドが一般的であり、デフォルトの values.yaml だけでは以下の問題が発生する:

1. **条件分岐の死角**: `{{ if .Values.feature.enabled }}` でデフォルト `false` のブロックはレンダリングされず、その中の Argo 参照エラーが検出されない
2. **値の不一致**: 本番では `--set image.tag=v2.0` だがデフォルトでは `latest` — 値依存のテンプレートロジックの検証漏れ
3. **複数環境の検証不可**: `values-production.yaml`, `values-staging.yaml` 等の環境別 values での検証ができない

## 目標

**Chart.yaml 内のアノテーションコメントで `--set` / `--values` / `--namespace` / `--release-name` を指定でき、`helm template` レンダリングに反映される。**

- Chart ごとに個別のオーバーライドを設定可能（複数 Chart 対応）
- Chart.yaml 変更時にオーバーライドが自動再読み込みされる
- 追加 values ファイルの変更も監視対象になる
- 外部設定ファイルやエディタ設定に依存しない（Chart.yaml だけで完結）

## アノテーション書式

Chart.yaml ファイル内に `# @lsp` プレフィックスのコメントを記述する:

```yaml
# Chart.yaml
apiVersion: v2
name: my-workflow
version: 0.1.0
description: My Argo Workflow chart

# @lsp releaseName: my-release
# @lsp namespace: production
# @lsp set: feature.enabled=true
# @lsp set: image.tag=v2.0
# @lsp values: values-production.yaml
# @lsp values: values-secrets.yaml
```

### 書式ルール

- **プレフィックス**: `# @lsp` （大小文字区別あり）
- **キー**: `releaseName`, `namespace`, `set`, `values`
- **キーとプレフィックスの間**: 1つ以上のスペース
- **複数値**: `set` と `values` は複数行で指定可能（各行に1つ）
- **位置**: Chart.yaml 内のどこでも可（トップレベル・フィールド間問わず）
- **パス**: `values` のパスは Chart ルートからの相対パス

### パース仕様

```
正規表現: /^#\s*@lsp\s+(releaseName|namespace|set|values):\s*(.+)$/
```

| キー | 型 | デフォルト | 説明 |
|------|-----|-----------|------|
| `releaseName` | 単一値（最後の宣言が優先） | `"lsp-preview"` | `helm template` のリリース名 |
| `namespace` | 単一値（最後の宣言が優先） | なし | `--namespace` 引数 |
| `set` | 配列（複数行で蓄積） | `[]` | `--set key=value` 引数 |
| `values` | 配列（複数行で蓄積） | `[]` | `--values file` 引数 |

## 設計

### 概要

```
Chart.yaml:
  # @lsp set: feature.enabled=true
  # @lsp values: values-production.yaml
  ↓
parseChartYaml() 拡張: アノテーションコメントも抽出
  ↓
HelmChart.overrides: HelmOverrides
  ↓
HelmTemplateExecutor: helm template --set ... --values ... --namespace ...
  ↓
RenderedArgoIndexCache / SymbolMappingIndex: overrides 付きレンダリング
```

### Step 1: HelmOverrides 型定義

**ファイル**: `packages/server/src/types/index.ts`

```typescript
/** helm template コマンドのオーバーライド設定 */
export type HelmOverrides = {
  /** --set key=value の配列 (例: ["image.tag=v2.0", "replicas=3"]) */
  set: string[];
  /** --values ファイルパスの配列 (Chart ルートからの相対パス) */
  values: string[];
  /** --release-name (デフォルト: "lsp-preview") */
  releaseName?: string;
  /** --namespace */
  namespace?: string;
};
```

### Step 2: parseChartYaml の拡張 — アノテーション抽出

**ファイル**: `packages/server/src/features/helmChartDetection.ts`

既存の `parseChartYaml()` はコメント行をスキップしている。アノテーションコメントを抽出するロジックを追加する。

```typescript
/** Chart.yaml から @lsp アノテーションをパース */
export function parseLspAnnotations(content: string): HelmOverrides | undefined {
  const lines = content.split('\n');
  const overrides: HelmOverrides = { set: [], values: [] };
  let found = false;

  const pattern = /^#\s*@lsp\s+(releaseName|namespace|set|values):\s*(.+)$/;

  for (const line of lines) {
    const match = line.trim().match(pattern);
    if (!match) continue;

    found = true;
    const [, key, value] = match;
    const trimmedValue = value.trim();

    switch (key) {
      case 'releaseName':
        overrides.releaseName = trimmedValue;
        break;
      case 'namespace':
        overrides.namespace = trimmedValue;
        break;
      case 'set':
        overrides.set.push(trimmedValue);
        break;
      case 'values':
        overrides.values.push(trimmedValue);
        break;
    }
  }

  return found ? overrides : undefined;
}
```

**HelmChart 型の拡張**:

```typescript
export type HelmChart = {
  name: string;
  chartYamlUri: string;
  valuesYamlUri?: string;
  templatesDir?: string;
  rootDir: string;
  metadata?: ChartMetadata;
  /** Phase 17: Chart.yaml 内の @lsp アノテーション */
  overrides?: HelmOverrides;
};
```

`findHelmCharts()` 内で `parseLspAnnotations()` も呼び出し、結果を `HelmChart.overrides` に格納する。

### Step 3: HelmTemplateExecutor — overrides 引数対応

**ファイル**: `packages/server/src/services/helmTemplateExecutor.ts`

`renderChart` と `renderSingleTemplate` の API を変更。`releaseName` パラメータを `overrides` に統合。

```typescript
async renderChart(
  chartDir: string,
  overrides?: HelmOverrides
): Promise<HelmRenderResult> {
  const releaseName = overrides?.releaseName || 'lsp-preview';
  const cacheKey = this.buildCacheKey(chartDir, releaseName, overrides);
  // ...
  const cmd = this.buildCommand(releaseName, chartDir, overrides);
  const { stdout, stderr } = await execAsync(cmd, { timeout: EXEC_TIMEOUT });
  // ...
}

async renderSingleTemplate(
  chartDir: string,
  templatePath: string,
  overrides?: HelmOverrides
): Promise<HelmRenderResult> {
  const releaseName = overrides?.releaseName || 'lsp-preview';
  const cacheKey = this.buildCacheKey(chartDir, releaseName, overrides, templatePath);
  // ...
  const cmd = this.buildCommand(releaseName, chartDir, overrides, templatePath);
  // ...
}
```

**新メソッド**:

```typescript
/** helm template コマンドを構築 */
private buildCommand(
  releaseName: string,
  chartDir: string,
  overrides?: HelmOverrides,
  showOnly?: string
): string {
  const parts = ['helm', 'template', shellEscape(releaseName), shellEscape(chartDir)];

  if (showOnly) {
    parts.push('--show-only', shellEscape(showOnly));
  }
  if (overrides?.namespace) {
    parts.push('--namespace', shellEscape(overrides.namespace));
  }
  for (const setValue of overrides?.set ?? []) {
    parts.push('--set', shellEscape(setValue));
  }
  for (const valuesFile of overrides?.values ?? []) {
    // Chart ルートからの相対パスを絶対パスに変換
    const absPath = path.isAbsolute(valuesFile)
      ? valuesFile
      : path.join(chartDir, valuesFile);
    parts.push('--values', shellEscape(absPath));
  }

  return parts.join(' ');
}

/** キャッシュキーを構築（overrides を含む） */
private buildCacheKey(
  chartDir: string,
  releaseName: string,
  overrides?: HelmOverrides,
  templatePath?: string
): string {
  let key = `${chartDir}::${releaseName}`;
  if (templatePath) {
    key += `::${templatePath}`;
  }
  // overrides がある場合はハッシュ化して追加
  if (overrides?.set?.length || overrides?.values?.length || overrides?.namespace) {
    const overrideStr = JSON.stringify({
      set: overrides.set ?? [],
      values: overrides.values ?? [],
      namespace: overrides.namespace ?? '',
    });
    key += `::ovr:${simpleHash(overrideStr)}`;
  }
  return key;
}
```

**simpleHash**: 短い文字列のハッシュ関数（キャッシュキー用）。

```typescript
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}
```

**既存 API 互換性**: 第2引数が `string`（releaseName）だった箇所を `HelmOverrides` に変更。既存の呼び出し元:
- `renderChart(chartDir, releaseName)` → `renderChart(chartDir, { releaseName })` に移行
- `renderChart(chartDir)` → そのまま（overrides は省略可能）
- テストの `renderChart(SAMPLE_CHART_DIR, 'my-release')` → `renderChart(SAMPLE_CHART_DIR, { releaseName: 'my-release' })` に更新

### Step 4: RenderedArgoIndexCache — Chart の overrides を利用

**ファイル**: `packages/server/src/services/renderedArgoIndexCache.ts`

Chart ごとに overrides を管理。`getRegistry()` 呼び出し時に Chart の overrides を受け取る。

```typescript
export class RenderedArgoIndexCache {
  /** Chart ごとの overrides を保持 */
  private overridesMap: Map<string, HelmOverrides | undefined> = new Map();

  /** Chart の overrides を設定（Chart.yaml 再パース時に呼ばれる） */
  setOverrides(chartDir: string, overrides?: HelmOverrides): void {
    const prev = JSON.stringify(this.overridesMap.get(chartDir) ?? {});
    const next = JSON.stringify(overrides ?? {});
    if (prev !== next) {
      this.overridesMap.set(chartDir, overrides);
      // overrides が変わった → そのChartのキャッシュ無効化
      this.invalidate(chartDir);
    }
  }

  private async fullRender(chartDir: string): Promise<...> {
    const overrides = this.overridesMap.get(chartDir);
    const renderResult = await this.helmTemplateExecutor.renderChart(chartDir, overrides);
    // ...
  }

  private async refreshSingleTemplate(chartDir: string, templatePath: string): Promise<...> {
    const overrides = this.overridesMap.get(chartDir);
    const result = await this.helmTemplateExecutor.renderSingleTemplate(
      chartDir, templatePath, overrides
    );
    // ...
  }
}
```

### Step 5: SymbolMappingIndex — overrides の伝播

**ファイル**: `packages/server/src/services/symbolMappingIndex.ts`

```typescript
export class SymbolMappingIndex {
  private overridesMap: Map<string, HelmOverrides | undefined> = new Map();

  setOverrides(chartDir: string, overrides?: HelmOverrides): void {
    const prev = JSON.stringify(this.overridesMap.get(chartDir) ?? {});
    const next = JSON.stringify(overrides ?? {});
    if (prev !== next) {
      this.overridesMap.set(chartDir, overrides);
      this.invalidate(chartDir); // overrides 変更 → マッピング再構築
    }
  }

  private async buildMapping(chartDir: string, templatePath: string): Promise<...> {
    const overrides = this.overridesMap.get(chartDir);
    const result = await this.executor.renderSingleTemplate(chartDir, templatePath, overrides);
    // ...
  }
}
```

### Step 6: server.ts — Chart.yaml 変更時の overrides 再読み込み

**ファイル**: `packages/server/src/server.ts`

Chart.yaml の変更時に `parseLspAnnotations()` を再実行し、各サービスに overrides を伝播する。

```typescript
// Chart.yaml 変更ハンドラ（既存）の拡張
// Chart.yaml change → overrides 再パース + 伝播
async function handleChartYamlChange(chartDir: string, chartYamlContent: string): void {
  const overrides = parseLspAnnotations(chartYamlContent);
  renderedArgoIndexCache.setOverrides(chartDir, overrides);
  symbolMappingIndex.setOverrides(chartDir, overrides);

  // 追加 values ファイル変更の監視を更新
  updateAdditionalValuesWatchers(chartDir, overrides);
}
```

**追加 values ファイル監視**:

既存の `**/*.{yaml,yml}` ファイル監視ハンドラ内で、追加 values ファイルの変更を検知:

```typescript
/** Chart ごとの追加 values ファイルを管理 */
const additionalValuesMap: Map<string, string[]> = new Map();

function updateAdditionalValuesWatchers(chartDir: string, overrides?: HelmOverrides): void {
  additionalValuesMap.set(chartDir, overrides?.values ?? []);
}

// ファイル変更ハンドラ内
function isAdditionalValuesFile(filePath: string, chartDir: string): boolean {
  const valuesFiles = additionalValuesMap.get(chartDir) ?? [];
  return valuesFiles.some(vf => {
    const absPath = path.isAbsolute(vf) ? vf : path.join(chartDir, vf);
    return filePath === absPath;
  });
}

// 追加 values ファイル変更時:
//   helmTemplateExecutor.clearCache(chartDir)
//   renderedArgoIndexCache.markAllDirty(chartDir)
//   symbolMappingIndex.invalidate(chartDir)
```

### Step 7: HelmChartIndex — 初期化時の overrides 伝播

**ファイル**: `packages/server/src/services/helmChartIndex.ts`

`initialize()` と `updateChart()` で、検出した Chart の overrides を各サービスに伝播する。

```typescript
// initialize() 完了後
for (const chart of this.getAllCharts()) {
  renderedArgoIndexCache.setOverrides(chart.rootDir, chart.overrides);
  symbolMappingIndex.setOverrides(chart.rootDir, chart.overrides);
}
```

## 変更対象ファイル

| ファイル | 変更内容 | リスク |
|---------|---------|-------|
| `types/index.ts` | `HelmOverrides` 型追加 | 低 |
| `features/helmChartDetection.ts` | `parseLspAnnotations()` 追加、`HelmChart.overrides` 追加 | 低 |
| `services/helmTemplateExecutor.ts` | `buildCommand()`, `buildCacheKey()` 追加。`renderChart`/`renderSingleTemplate` に overrides パラメータ | 中 — API 変更 |
| `services/renderedArgoIndexCache.ts` | `setOverrides(chartDir, overrides)` 追加。内部呼び出しに overrides を伝播 | 低 |
| `services/symbolMappingIndex.ts` | `setOverrides(chartDir, overrides)` 追加。`buildMapping` に overrides を伝播 | 低 |
| `server.ts` | Chart.yaml 変更ハンドラで overrides 再パース・伝播。追加 values ファイル監視 | 中 |
| `services/helmChartIndex.ts` | 初期化時の overrides 伝播（コールバック or server.ts 側） | 低 |

**変更しないファイル**: `diagnosticProvider.ts`, `definitionProvider.ts`, `hoverProvider.ts`（RenderedArgoIndexCache 経由で透過的に overrides が適用される）

**不要**: VSCode クライアント (`package.json`) の設定変更 — アノテーションは Chart.yaml で完結

## テスト計画

### 単体テスト

| テストファイル | テスト内容 |
|--------------|-----------|
| `helmChartDetection.test.ts` | `parseLspAnnotations` — 各キーのパース |
| `helmChartDetection.test.ts` | `parseLspAnnotations` — 複数 `set`/`values` の蓄積 |
| `helmChartDetection.test.ts` | `parseLspAnnotations` — アノテーションなし → `undefined` |
| `helmChartDetection.test.ts` | `parseLspAnnotations` — `releaseName`/`namespace` は最後の宣言が優先 |
| `helmTemplateExecutor.test.ts` | `buildCommand` — `--set`, `--values`, `--namespace` が正しく構築される |
| `helmTemplateExecutor.test.ts` | `buildCacheKey` — overrides が異なるとキーが変わる |
| `helmTemplateExecutor.test.ts` | `renderChart(chartDir, overrides)` — overrides 付きレンダリング |
| `renderedArgoIndexCache.test.ts` | `setOverrides` — 変更時にキャッシュ無効化 |
| `renderedArgoIndexCache.test.ts` | `setOverrides` — 同一値なら無操作 |
| `symbolMappingIndex.test.ts` | `setOverrides` — 変更時にマッピング全クリア |

### 統合テスト

| シナリオ | 期待動作 |
|---------|---------|
| Chart.yaml に `# @lsp set: feature.enabled=true` 追加 → 診断 | `{{ if .Values.feature.enabled }}` ブロック内の Argo 参照が検証される |
| Chart.yaml に `# @lsp values: values-prod.yaml` 追加 → 診断 | prod 固有の値でレンダリング、結果の Argo 参照が検証される |
| Chart.yaml のアノテーション変更 → 次回診断 | 古いキャッシュが無効化され、新しい overrides でレンダリングされる |
| 追加 values ファイル変更 → 診断 | キャッシュが無効化され、更新された値でレンダリングされる |

## 実装順序

1. **Step 1**: `HelmOverrides` 型定義
2. **Step 2**: `parseLspAnnotations()` + `HelmChart.overrides` + テスト
3. **Step 3**: `HelmTemplateExecutor` の overrides 対応 + テスト
4. **Step 4**: `RenderedArgoIndexCache.setOverrides()` + テスト
5. **Step 5**: `SymbolMappingIndex.setOverrides()` + テスト
6. **Step 6**: `server.ts` の Chart.yaml 変更ハンドラ + 追加 values 監視
7. **Step 7**: `HelmChartIndex` 初期化時の overrides 伝播
8. 統合テスト + 全テスト通過確認

## 影響範囲

- **後方互換**: `overrides` パラメータは省略可能。アノテーション未記述の Chart は従来と同一動作。
- **Chart 個別設定**: overrides は Chart ごとに独立。複数 Chart がワークスペースにあっても問題なし。
- **パフォーマンス**: Chart.yaml 変更時に該当 Chart のキャッシュが無効化されるが、変更頻度は低いため影響軽微。
- **セキュリティ**: `--set` / `--values` の値はユーザーの Chart.yaml 由来のため、`shellEscape` によるインジェクション防止が必須。
- **エディタ非依存**: Chart.yaml 内のコメントで完結するため、VSCode / Neovim / その他どのクライアントでも動作する。

## 制約・前提

- `--values` のパスは Chart ルートからの相対パス、または絶対パスを想定。
- `--set` の値は文字列として渡す。`--set-file`, `--set-json` は初期実装では非対応（将来拡張可）。
- アノテーションは `# @lsp` プレフィックス固定。将来的に他のキーを追加する場合も同じ書式で拡張可能。
