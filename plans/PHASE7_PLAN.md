# Phase 7 実装計画: Helm Template Rendering Awareness

**最終更新**: 2026-02-06

## 概要

Phase 6までで、Helm内のArgo Workflowsテンプレートファイルに対する静的解析機能は完成しました。しかし、実際に`helm template`で展開された後のYAMLファイルに対しては、Helmテンプレート構文が失われるため、LSP機能が十分に機能しません。

Phase 7では、**テンプレート展開前後のファイルマッピング**を作成し、展開後のYAMLでもLSP機能（ジャンプ、ホバー、補完）を提供します。

---

## 問題の定義

### 現在の制限

**テンプレートファイル（templates/workflow.yaml）**:
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: {{ .Values.workflow.name }}
spec:
  templates:
    - name: {{ .Values.template.name }}  # ← ここでF12押すとvalues.yamlにジャンプ ✅
      container:
        image: {{ .Values.image.repository }}
```

**展開後（helm template実行後）**:
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: my-workflow
spec:
  templates:
    - name: process-data  # ← F12押しても何も起きない ❌
      container:
        image: alpine
```

### ユースケース

1. **開発時のプレビュー**: `helm template`で生成されたYAMLをプレビューしながら編集
2. **デバッグ**: 実際に展開された値を確認しながら、元の定義にジャンプ
3. **ドキュメント参照**: 展開後の値にホバーして、元の`.Values`参照や説明を表示

---

## Phase 7のゴール

展開後のYAMLファイルで以下を実現：

1. **Go to Definition**: 展開後の値から、元のHelmテンプレート参照や値定義にジャンプ
2. **Hover**: 展開後の値にホバーして、元のテンプレート構文や値の説明を表示
3. **Reverse Mapping**: 展開後のYAMLの行から、元のテンプレートファイルの行を特定

---

## アーキテクチャ概要

### コア技術: Template Rendering & Symbol Mapping

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 7: Template Rendering Awareness                       │
└─────────────────────────────────────────────────────────────┘

1. Helm Template Rendering
   ┌──────────────────┐
   │ templates/       │
   │  workflow.yaml   │  →  helm template  →  ┌──────────────┐
   │  values.yaml     │                        │ Rendered     │
   └──────────────────┘                        │ YAML (temp)  │
                                               └──────────────┘

2. Symbol Mapping Creation
   ┌──────────────────┐         ┌──────────────────┐
   │ Original Template│  Diff   │ Rendered YAML    │
   │  (with {{ }})    │ ──────→ │  (plain values)  │
   └──────────────────┘   ↓     └──────────────────┘
                          ↓
                    ┌─────────────────┐
                    │ Position Mapping │
                    │  Line:Col pairs  │
                    └─────────────────┘

3. LSP Feature Enhancement
   User hovers on "process-data" in rendered YAML
      ↓
   Lookup position mapping
      ↓
   Find original template position: {{ .Values.template.name }}
      ↓
   Provide hover info: "Defined in values.yaml:12"
```

---

## Phase 7.1: Helm Template Rendering

### 目的

`helm template`コマンドを実行して、テンプレートを実際に展開する。

### 実装内容

#### 7.1.1 Helm Template Executor

**ファイル**: `packages/server/src/services/helmTemplateExecutor.ts`

**機能**:
- `helm template`コマンドの実行
- Chart名、values.yamlパスの指定
- 展開結果の一時ファイル保存
- エラーハンドリング（Helm未インストール、構文エラー等）

**メソッド**:
```typescript
class HelmTemplateExecutor {
  /**
   * Helmテンプレートを展開
   *
   * @param chartDir - Chartのルートディレクトリ
   * @param templateFile - 展開対象のテンプレートファイル（オプション）
   * @returns 展開後のYAML文字列
   */
  async renderTemplate(
    chartDir: string,
    templateFile?: string
  ): Promise<string>

  /**
   * Helmコマンドが利用可能かチェック
   */
  async isHelmAvailable(): Promise<boolean>

  /**
   * 展開結果をキャッシュ
   */
  cacheRenderedTemplate(
    chartDir: string,
    content: string
  ): void

  /**
   * キャッシュをクリア（values.yaml変更時）
   */
  clearCache(chartDir: string): void
}
```

#### 7.1.2 実行コマンド例

```bash
# 基本形
helm template my-release /path/to/chart

# 特定のテンプレートファイルのみ展開
helm template my-release /path/to/chart --show-only templates/workflow.yaml

# valuesファイル指定
helm template my-release /path/to/chart -f custom-values.yaml
```

#### 7.1.3 実装タスク

- [ ] HelmTemplateExecutorクラス実装
- [ ] `helm template`コマンド実行ロジック
- [ ] 展開結果のパース（multi-document YAML対応）
- [ ] キャッシュ機構（values.yaml変更時に再展開）
- [ ] エラーハンドリング
- [ ] テスト作成（15+ tests）

---

## Phase 7.2: Symbol Mapping（シンボルマッピング）

### 目的

元のテンプレートファイルと展開後のYAMLファイルの対応関係を作成する。

### 実装アプローチ

#### A. Line-based Mapping（行ベースマッピング）

**アルゴリズム**: Longest Common Subsequence (LCS) / Diff

```typescript
type LineMapping = {
  // 展開後のYAML行番号 → 元のテンプレート行番号
  renderedLine: number;
  originalLine: number;
  confidence: number; // 0.0 ~ 1.0（マッチング信頼度）
}
```

**例**:
```yaml
# templates/workflow.yaml (行番号)
1: apiVersion: argoproj.io/v1alpha1
2: kind: Workflow
3: metadata:
4:   name: {{ .Values.workflow.name }}
5: spec:
6:   templates:
7:     - name: {{ .Values.template.name }}

# Rendered (行番号)
1: apiVersion: argoproj.io/v1alpha1
2: kind: Workflow
3: metadata:
4:   name: my-workflow
5: spec:
6:   templates:
7:     - name: process-data

# Mapping
renderedLine: 4 → originalLine: 4 (confidence: 0.8)
renderedLine: 7 → originalLine: 7 (confidence: 0.9)
```

#### B. Token-based Mapping（トークンベースマッピング）

**アルゴリズム**: トークン位置の近接性分析

```typescript
type TokenMapping = {
  // 展開後のYAMLのトークン位置
  renderedPosition: { line: number; character: number };
  // 元のテンプレートのトークン位置
  originalPosition: { line: number; character: number };
  // マッチングスコア
  score: number;
  // 元のテンプレート構文（存在する場合）
  originalTemplate?: string; // e.g., "{{ .Values.template.name }}"
}
```

**トークンの種類**:
1. **固定値**: `apiVersion`, `kind`, `Workflow` → 完全一致
2. **Helm変数展開**: `{{ .Values.xxx }}` → 値の近似マッチ
3. **条件分岐**: `{{ if }}` → ブロック全体のマッピング
4. **関数呼び出し**: `{{ include "name" }}` → 展開結果との対応

#### C. Symbol Proximity Analysis（シンボル近接性分析）

**戦略**:
1. **完全一致優先**: `apiVersion: argoproj.io/v1alpha1`など
2. **キー名一致**: YAMLキー名が同じ場合（`name:`、`image:`等）
3. **近接行マッチング**: 前後の行が一致している場合、中間行も対応
4. **構造類似度**: YAMLツリー構造の類似度スコア

**実装例**:
```typescript
class SymbolMapper {
  /**
   * 元のテンプレートと展開後のYAMLからマッピングを作成
   */
  createMapping(
    originalTemplate: string,
    renderedYaml: string
  ): SymbolMapping

  /**
   * 展開後の位置から元の位置を検索
   */
  findOriginalPosition(
    renderedPosition: Position,
    mapping: SymbolMapping
  ): Position | undefined

  /**
   * 信頼度スコアを計算
   */
  calculateConfidence(
    originalLine: string,
    renderedLine: string
  ): number
}
```

#### 7.2.1 実装タスク

- [ ] SymbolMapperクラス実装
- [ ] LCSベースの行マッピング
- [ ] トークン位置のマッピング
- [ ] 信頼度スコア計算ロジック
- [ ] キャッシュ機構
- [ ] テスト作成（20+ tests）

---

## Phase 7.3: LSP Feature Integration（LSP機能統合）

### 目的

作成したマッピングを使用して、既存のLSP機能（Definition、Hover、Completion）を拡張する。

### 実装内容

#### 7.3.1 Definition Provider拡張

**機能**: 展開後のYAMLから元のテンプレート定義にジャンプ

**例**:
```yaml
# Rendered YAML
spec:
  templates:
    - name: process-data  # ← F12を押す
```

**動作**:
1. `process-data`の位置（line: 7, character: 12）を取得
2. SymbolMappingで元の位置を検索 → `{{ .Values.template.name }}`
3. `.Values.template.name`の定義にジャンプ → `values.yaml:15`

**実装**:
```typescript
// definitionProvider.ts
async provideDefinition(
  document: TextDocument,
  position: Position
): Promise<Location | Location[] | null> {
  // 既存のロジック
  const existingDefinition = await this.existingProvideDefinition(...);
  if (existingDefinition) {
    return existingDefinition;
  }

  // NEW: 展開後のYAMLの場合
  if (this.isRenderedYaml(document.uri)) {
    const mapping = await this.symbolMappingIndex.getMapping(document.uri);
    if (mapping) {
      const originalPosition = mapping.findOriginalPosition(position);
      if (originalPosition) {
        // 元のテンプレートファイルで定義を検索
        return this.findDefinitionInOriginalTemplate(originalPosition);
      }
    }
  }

  return null;
}
```

#### 7.3.2 Hover Provider拡張

**機能**: 展開後の値にホバーして、元のテンプレート情報を表示

**例**:
```yaml
# Rendered YAML
metadata:
  name: my-workflow  # ← ホバー
```

**ホバー情報**:
```markdown
**Value**: `my-workflow`

**Original Template**:
`{{ .Values.workflow.name }}`

**Defined in**: `values.yaml:8`

```yaml
workflow:
  name: my-workflow
```
```

**実装**:
```typescript
// hoverProvider.ts
async provideHover(
  document: TextDocument,
  position: Position
): Promise<Hover | null> {
  // 既存のロジック
  const existingHover = await this.existingProvideHover(...);
  if (existingHover) {
    return existingHover;
  }

  // NEW: 展開後のYAMLの場合
  if (this.isRenderedYaml(document.uri)) {
    const mapping = await this.symbolMappingIndex.getMapping(document.uri);
    if (mapping) {
      const token = mapping.findTokenAtPosition(position);
      if (token && token.originalTemplate) {
        return this.createHoverForRenderedValue(token);
      }
    }
  }

  return null;
}
```

#### 7.3.3 実装タスク

- [ ] Definition Provider拡張
- [ ] Hover Provider拡張
- [ ] Completion Provider拡張（オプション）
- [ ] RenderedYaml判定ロジック
- [ ] テスト作成（15+ tests）

---

## Phase 7.4: Incremental Update（増分更新）

### 目的

values.yamlやChart.yamlが変更されたときに、マッピングを自動的に再構築する。

### 実装内容

#### 7.4.1 ファイル監視

**トリガー**:
- `values.yaml`変更時
- `Chart.yaml`変更時
- `templates/*.yaml`変更時

**動作**:
1. 変更を検知
2. 該当Chartの展開結果キャッシュをクリア
3. バックグラウンドで`helm template`を再実行
4. 新しいマッピングを作成
5. LSP機能を更新

#### 7.4.2 パフォーマンス最適化

**課題**: `helm template`は数秒かかる可能性がある

**対策**:
1. **非同期実行**: バックグラウンドでレンダリング
2. **部分更新**: 変更されたテンプレートファイルのみ再展開（`--show-only`）
3. **Debouncing**: 連続した変更をまとめて処理（300ms）
4. **キャッシュ**: 展開結果をメモリとディスクにキャッシュ

#### 7.4.3 実装タスク

- [ ] ファイル監視統合
- [ ] 増分更新ロジック
- [ ] パフォーマンス最適化
- [ ] エラーハンドリング
- [ ] テスト作成（10+ tests）

---

## Phase 7.5: UI/UX Enhancement（UI/UX改善）

### 目的

ユーザーに展開後のYAMLとの対応関係を視覚的に示す。

### 実装内容（オプション）

#### 7.5.1 CodeLens

**機能**: テンプレートファイルの各行に、展開後の値をインライン表示

```yaml
# templates/workflow.yaml
metadata:
  name: {{ .Values.workflow.name }}  # ← "Renders to: my-workflow" とCodeLensで表示
```

#### 7.5.2 Diagnostics

**機能**: Helm展開エラーを診断として表示

```yaml
# templates/workflow.yaml
metadata:
  name: {{ .Values.nonexistent.value }}
  # ↑ エラー: ".Values.nonexistent.value" is not defined in values.yaml
```

#### 7.5.3 実装タスク（オプション）

- [ ] CodeLens実装
- [ ] Diagnostics統合
- [ ] コマンド追加（"Helm: Show Rendered Template"）
- [ ] テスト作成（5+ tests）

---

## 技術的課題

### 課題1: Helm条件分岐のマッピング

**問題**:
```yaml
# Template
{{ if .Values.enabled }}
  name: workflow-enabled
{{ else }}
  name: workflow-disabled
{{ end }}

# Rendered（enabled=true）
  name: workflow-enabled
```

**対策**: 条件分岐ブロック全体をマークし、展開された分岐を追跡

---

### 課題2: include/template関数の展開

**問題**:
```yaml
# Template
{{- include "myapp.labels" . | nindent 4 }}

# Rendered
    app: myapp
    version: 1.0.0
    environment: production
```

**対策**: include元のテンプレート定義にもマッピングを作成

---

### 課題3: マッピング精度の担保

**問題**: 完全に一致しない行の対応付け

**対策**:
1. 信頼度スコアを計算（0.0〜1.0）
2. スコアが低い場合は「曖昧な対応」として扱う
3. ユーザーに警告表示（オプション）

---

## 実装順序の推奨

```
Phase 7.1 → Phase 7.2 → Phase 7.3 → Phase 7.4 → Phase 7.5
  (必須)     (必須)      (必須)      (推奨)     (オプション)
```

1. **Phase 7.1**: Helmテンプレート展開（基盤）
2. **Phase 7.2**: シンボルマッピング作成（コア機能）
3. **Phase 7.3**: LSP統合（ユーザー向け機能）
4. **Phase 7.4**: 増分更新（UX改善）
5. **Phase 7.5**: UI/UX改善（将来拡張）

---

## Phase 7完了基準

以下がすべて満たされた時点で Phase 7 完了とする：

- [ ] `helm template`が正常に実行される
- [ ] 元のテンプレートと展開後のYAMLのマッピングが作成される
- [ ] 展開後のYAMLで定義ジャンプが動作する
- [ ] 展開後のYAMLでホバー情報が表示される
- [ ] values.yaml変更時にマッピングが自動更新される
- [ ] パフォーマンスが許容範囲内（展開 < 3秒）
- [ ] 全テストが通過する（60+ tests想定）
- [ ] VSCodeとNeovim両方で動作確認できる

---

## サンプルファイル

Phase 7の動作確認用に、以下のサンプルを追加：

```
samples/helm-rendered/
├── Chart.yaml
├── values.yaml
├── templates/
│   └── workflow.yaml
└── rendered/                # helm template の出力（参考用）
    └── workflow.yaml
```

---

## 将来の拡張

### Phase 7.6: Multi-values Support

複数のvaluesファイル（dev.yaml, prod.yaml）に対応：

```bash
helm template my-release . -f values.yaml -f values-prod.yaml
```

### Phase 7.7: Live Preview

テンプレートファイル編集中に、リアルタイムで展開結果をプレビュー表示。

---

## 参考資料

- [Helm Template Command](https://helm.sh/docs/helm/helm_template/)
- [YAML Diff Algorithms](https://github.com/homeport/dyff)
- [Longest Common Subsequence](https://en.wikipedia.org/wiki/Longest_common_subsequence_problem)
- [Source Map Specification](https://sourcemaps.info/spec.html)（類似概念）

---

## 技術スタック

- **言語**: TypeScript（strict mode）
- **Helmコマンド実行**: Node.js `child_process`
- **Diffアルゴリズム**: LCS / `diff-match-patch`ライブラリ
- **YAMLパース**: `js-yaml`
- **キャッシュ**: メモリ（Map） + ファイルシステム

---

**Phase 7の価値**: 展開後のYAMLでもLSP機能を提供することで、Helmチャート開発の生産性を飛躍的に向上させる。
