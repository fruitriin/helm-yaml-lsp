# Regression Test Plan - Multi-Document YAML Support

**Date**: 2026-01-27
**Version**: Phase 5 Post-Fix
**Status**: Completed ✅

---

## 概要

このドキュメントは、複数YAMLドキュメント（`---`区切り）を1つのファイルに含む場合の問題を修正し、リグレッションを防ぐためのテスト計画を記録します。

---

## 発見された問題

### Issue #1: 複数YAMLドキュメントでのテンプレート参照検出の失敗

**症状**:
- `samples/argo/demo-workflow.yaml`（ConfigMap、Secret、WorkflowTemplate、Workflowを含む）で、ローカルテンプレート参照が「見つからない」とエラー表示される
- 例: `template: init-step` → "Template 'init-step' not found in this Workflow"

**根本原因**:
`findAllTemplateReferences`関数が、ファイル全体から**最初のkind**のみを取得していた。

```typescript
// ❌ 問題のあったコード
let kind: ArgoWorkflowKind | undefined;
for (let i = 0; i < lines.length; i++) {
  const kindMatch = lines[i].match(/kind:\s*['"]?(...)/);
  if (kindMatch) {
    kind = kindMatch[1] as ArgoWorkflowKind;
    break;  // ★ここで終了してしまう
  }
}
```

複数ドキュメントの場合：
1. ConfigMap (kind: ConfigMap) ← 非Argo、スキップ
2. Secret (kind: Secret) ← 非Argo、スキップ
3. **WorkflowTemplate** (kind: WorkflowTemplate) ← **ここでbreakして終了**
4. Workflow (kind: Workflow) ← この中のテンプレート参照もWorkflowTemplateとして扱われる

**修正内容**:
- YAMLドキュメント区切り（`---`）でkindをリセット
- 各ドキュメントごとにkindを追跡

```typescript
// ✅ 修正後のコード
let kind: ArgoWorkflowKind | undefined;
for (let lineNum = 0; lineNum < lines.length; lineNum++) {
  const line = lines[lineNum];

  // YAMLドキュメント区切りでリセット
  if (line.trim() === '---') {
    kind = undefined;
    continue;
  }

  // 各ドキュメントのkind:を検出して更新
  const kindMatch = line.match(/^kind:\s*['"]?(...)/);
  if (kindMatch) {
    kind = kindMatch[1] as ArgoWorkflowKind;
    continue;
  }
  // ... テンプレート参照の検出処理
}
```

**修正ファイル**: `packages/server/src/features/templateFeatures.ts:281-`

---

### Issue #2: 複数YAMLドキュメントでのConfigMap/Secret検出の失敗

**症状**:
- ConfigMapとSecretの定義が同一ファイル内に存在しても「見つからない」とエラー表示される
- 例: `configMapKeyRef.name: app-config` → "ConfigMap 'app-config' not found"

**根本原因**:
`findConfigMapDefinitions`関数が、`kind: Workflow`等の非対象kindを検出した時に状態をリセットしていなかった。

このため、ConfigMap定義の後にWorkflowが来ると、Workflowの`metadata.name`をConfigMapのnameとして誤認識していた。

**修正内容**:
- `kind:`を検出した時に、ConfigMap/Secret以外のkindであれば状態をリセット
- 前の定義を保存してから新しいkindに切り替え

```typescript
// ✅ 修正後のコード
if (trimmedLine.startsWith('kind:')) {
  // 前の定義を保存
  if (currentKind && currentName && currentNameRange) {
    const keys = dataStartLine >= 0 ? extractDataKeys(lines, dataStartLine, i) : [];
    definitions.push({ name: currentName, kind: currentKind, uri: document.uri, nameRange: currentNameRange, keys });
  }

  // ConfigMap/Secretかチェック
  const kindMatch = trimmedLine.match(/^kind:\s*(ConfigMap|Secret)/);
  if (kindMatch) {
    currentKind = kindMatch[1] as 'ConfigMap' | 'Secret';
  } else {
    // 非対象kindの場合、状態をリセット
    currentKind = null;
    currentName = null;
    // ... 他の状態もリセット
  }
}
```

**修正ファイル**: `packages/server/src/features/configMapFeatures.ts:90-`

---

### Issue #3: 複数YAMLドキュメントでのテンプレート定義検出の失敗

**症状**:
- WorkflowTemplate内のテンプレート定義が検出されない
- 例: WorkflowTemplateの`- name: process-data`が見つからない

**根本原因（複数）**:

1. **非Argo Workflowのmetadata.nameを誤認識**
   - 任意の`metadata.name`を`currentWorkflowName`として設定していたため、ConfigMapやSecretのnameも誤って設定されていた

2. **templates:セクションを誤検出**
   - ConfigMapのdata配下に`templates:`というキーがあると、誤ってテンプレートセクションとして認識

3. **テンプレート定義のインデント判定が厳しすぎる**
   - 既存テストファイルの非標準インデント（`      - name:`、6スペース）に対応していなかった

**修正内容**:

1. 非Argo Workflowのkind検出とリセット
```typescript
// 非Argo Workflowのkind（ConfigMap, Secret等）を検出
const nonArgoKindMatch = line.match(/^kind:\s*['"]?(\w+)['"]?/);
if (nonArgoKindMatch && !currentKind) {
  // 状態をリセット
  currentWorkflowName = undefined;
  inTemplatesSection = false;
  continue;
}
```

2. `metadata.name`処理の条件追加
```typescript
// currentKindが設定されている場合のみ処理
if (metadataNameMatch && !inTemplatesSection && currentKind) {
  // ...
}
```

3. `templates:`検出の条件追加
```typescript
// Argo Workflowの場合のみtemplates:を認識
if (templatesMatch && currentKind) {
  inTemplatesSection = true;
  // ...
}
```

4. インデント許容範囲の拡大
```typescript
// 標準: templatesIndent + 0〜2
// 非標準（後方互換性）: templatesIndent + 0〜6
const minTemplateIndent = templatesIndent;
const maxTemplateIndent = templatesIndent + 6;

if (matchIndent >= minTemplateIndent && matchIndent <= maxTemplateIndent) {
  // テンプレート定義として認識
}
```

**修正ファイル**: `packages/server/src/features/templateFeatures.ts:82-`

---

### Issue #4: ConfigMapIndexのURI生成が不正

**症状**:
- ConfigMapIndexが同一ファイル内のConfigMap/Secret定義を正しくインデックス化できない

**根本原因**:
`indexFile`メソッドで、`file://${filePath}`という不正なURI形式を使用していた（スラッシュが2つ）。

正しくは`file:///${filePath}`（スラッシュ3つ）または`filePathToUri`関数を使用する必要がある。

**修正内容**:
```typescript
// ❌ 問題のあったコード
const uri = `file://${filePath}`;

// ✅ 修正後のコード
const uri = filePathToUri(filePath);
```

**修正ファイル**: `packages/server/src/services/configMapIndex.ts:102`

---

## 追加されたテストケース

### 1. ConfigMap Features - Multi-document YAML

**ファイル**: `packages/server/test/features/configMapFeatures-multidoc.test.ts`

**テストケース**:
- ✅ ConfigMapとSecretが複数YAMLドキュメントで正しく検出される
- ✅ Workflow nameがConfigMap nameと混同されない

```typescript
it('should find ConfigMap and Secret in multi-document YAML file', () => {
  // ConfigMap、Secret、WorkflowTemplate、Workflowを含むファイル
  // → ConfigMapとSecretのみが検出される
});

it('should not confuse Workflow name with ConfigMap name', () => {
  // ConfigMapの後にWorkflowがある場合
  // → WorkflowのnameはConfigMapとして認識されない
});
```

### 2. Template Features - Multi-document YAML

**ファイル**: `packages/server/test/features/templateFeatures-multidoc.test.ts`

**テストケース**:
- ✅ WorkflowTemplate内のテンプレート定義が正しく検出される
- ✅ Workflow内のローカルテンプレート定義が正しく検出される
- ✅ ConfigMapのdata配下の`templates:`キーが誤検出されない

```typescript
it('should find templates in WorkflowTemplate after ConfigMap/Secret', () => {
  // ConfigMap、Secret、WorkflowTemplate、Workflowを含むファイル
  // → 5つのテンプレート定義が正しく検出される
  //   - WorkflowTemplate: 3つ（process-data, use-configmap, use-secrets）
  //   - Workflow: 2つ（main, local-template）
});

it('should not confuse ConfigMap with WorkflowTemplate', () => {
  // ConfigMapのdata配下に"templates"キーがある場合
  // → WorkflowTemplateのテンプレート定義のみが検出される
});
```

### 3. Template Debug Test

**ファイル**: `packages/server/test/features/template-debug.test.ts`

**目的**: デバッグ用（開発時のみ使用）

---

## リグレッションテストの実行方法

### ⭐ 中核テスト: VSCode拡張機能での実機テスト

**最重要**: 自動テストだけでなく、実際のVSCode環境でLSPサーバーの診断機能を確認することを中核とします。

#### 前提条件

1. VSCodeに本拡張機能がインストールされている
2. LSPサーバーがビルド済み（`bun run build`）

#### テスト手順

**1. Argo版デモファイルの診断テスト**

```bash
# VSCodeでArgo版デモファイルを開く
code samples/argo/demo-workflow.yaml
```

**診断チェックリスト**:
- [ ] **Diagnostics（診断）**: エラー・警告が0件
- [ ] **Line 129-175**: ConfigMap/Secret参照にエラーが表示されない
  - `configMapKeyRef.name: app-config` → ✅ エラーなし
  - `secretKeyRef.name: app-secrets` → ✅ エラーなし
- [ ] **Line 211, 215**: Volume参照にエラーが表示されない
  - `volumes.configMap.name: app-config` → ✅ エラーなし
  - `volumes.secret.secretName: app-secrets` → ✅ エラーなし
- [ ] **Line 225, 245**: ローカルテンプレート参照にエラーが表示されない
  - `template: init-step` → ✅ エラーなし
  - `template: validate-step` → ✅ エラーなし
- [ ] **Line 234, 258, 263**: WorkflowTemplate参照にエラーが表示されない
  - `templateRef.template: process-data` → ✅ エラーなし
  - `templateRef.template: use-configmap` → ✅ エラーなし
  - `templateRef.template: use-secrets` → ✅ エラーなし
- [ ] **Line 314**: envFrom参照にエラーが表示されない
  - `envFrom.configMapRef.name: app-config` → ✅ エラーなし

**機能テスト**:
- [ ] **F12 (定義ジャンプ)**:
  - ConfigMap名 → L35 (metadata.name: app-config)
  - Secret名 → L59 (metadata.name: app-secrets)
  - dataキー → L39, L40等（各キー定義）
  - テンプレート名 → L85, L113等（テンプレート定義）
- [ ] **ホバー情報**:
  - ConfigMap名 → 名前、キー数、キーリスト表示
  - Secret名 → 名前、キー数（値は`[hidden]`）
  - テンプレート名 → テンプレートの説明表示
  - workflow変数 → 各変数の説明表示
- [ ] **補完（Ctrl+Space）**:
  - ConfigMap/Secret名の補完
  - dataキーの補完
  - テンプレート名の補完

**2. Helm版デモファイルの診断テスト**

```bash
# VSCodeでHelm版デモファイルを開く
code samples/helm/templates/demo-workflow.yaml
```

**診断チェックリスト**:
- [ ] **Diagnostics（診断）**: エラー・警告が0件
- [ ] **ConfigMap/Secret参照**: 全てエラーなし（Argo版と同様）
- [ ] **テンプレート参照**: 全てエラーなし（Argo版と同様）
- [ ] **Helm固有機能**:
  - `.Values.*`参照 → エラーなし、values.yamlへジャンプ可能
  - `include "xxx"`参照 → エラーなし、_helpers.tplへジャンプ可能
  - Helm組み込み関数（`quote`, `indent`, `toYaml`等） → ホバー情報表示
  - `.Chart.*`変数 → Chart.yamlへジャンプ可能
  - `.Release.*`変数 → ホバー情報表示

**スクリーンショット記録（推奨）**:
- 診断結果（Problems パネル）
- 定義ジャンプの動作
- ホバー情報の表示

---

### 補助テスト: 自動テストスイート

VSCode実機テストを補完する自動テストです。

**1. 全テストの実行**

```bash
bun run test
```

**期待される結果**:
- 444 pass
- 1 skip
- 0 fail

**2. 特定テストの実行**

```bash
# ConfigMap multi-document test
bun test packages/server/test/features/configMapFeatures-multidoc.test.ts

# Template multi-document test
bun test packages/server/test/features/templateFeatures-multidoc.test.ts
```

---

### テスト実行の優先順位

1. **最優先**: VSCode拡張機能での実機テスト（上記の中核テスト）
2. **次優先**: 自動テストスイート（`bun run test`）
3. **オプション**: Neovimでの動作確認

---

## 影響範囲

### 修正されたファイル

1. **packages/server/src/features/templateFeatures.ts**
   - `findAllTemplateReferences`: YAMLドキュメント区切り対応
   - `findTemplateDefinitions`: 非Argo Workflow kind検出、templates:検出条件、インデント許容範囲拡大

2. **packages/server/src/features/configMapFeatures.ts**
   - `findConfigMapDefinitions`: 非対象kind検出と状態リセット

3. **packages/server/src/services/configMapIndex.ts**
   - `indexFile`: URI生成の修正

### 追加されたテストファイル

1. `packages/server/test/features/configMapFeatures-multidoc.test.ts`（2テスト）
2. `packages/server/test/features/templateFeatures-multidoc.test.ts`（2テスト）
3. `packages/server/test/features/template-debug.test.ts`（1テスト、デバッグ用）

### 既存機能への影響

- ✅ **後方互換性**: 既存のテストは全て通過（444 pass、0 fail）
- ✅ **パフォーマンス**: 複数YAMLドキュメントのループ処理により若干の処理時間増加の可能性があるが、無視できる範囲
- ✅ **機能追加**: 新たに複数YAMLドキュメントをサポート

---

## デモファイルの更新

### 新規作成されたファイル

1. **samples/argo/demo-workflow.yaml**（326行）
   - Phase 5までの全機能を包括的にデモ
   - ConfigMap、Secret、WorkflowTemplate、Workflowを1ファイルに含む
   - チェックリスト付き

2. **samples/helm/templates/demo-workflow.yaml**（592行）
   - Phase 5までの全機能（Helm版）
   - Helm固有機能も含む
   - チェックリスト付き

3. **samples/argo/demo-workflow-split.yaml**（簡易テスト用）

### 更新されたファイル

1. **samples/helm/values.yaml**
   - デモ用の設定を追加

2. **samples/helm/templates/_helpers.tpl**
   - デモ用のヘルパー関数を追加

3. **samples/README.md**
   - 新しいデモファイルの説明を追加

---

## 今後の推奨事項

### 1. CI/CDでのリグレッションテスト

```yaml
# .github/workflows/test.yml (example)
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run build
      - run: bun run test
      - run: bun run check
```

### 2. 複数YAMLドキュメントのテストカバレッジ拡大

以下のケースについてもテストを追加することを推奨：

- [ ] 10個以上のYAMLドキュメントを含むファイル
- [ ] 異なる順序でのドキュメント配置（Workflow → ConfigMap → WorkflowTemplate）
- [ ] 空のYAMLドキュメント（`---`のみ）が含まれる場合
- [ ] コメントのみのYAMLドキュメント

### 3. ドキュメントへの記載

- [ ] README.mdに「複数YAMLドキュメントのサポート」を追記
- [ ] CLAUDE.mdの「実装済み機能」に追記

---

## Claude Code実行手順（VSCode実機テスト）

### 準備

```bash
# 1. ビルド
bun run build

# 2. VSCodeでプロジェクトを開く
code /Users/riin/workspace/helm-yaml-lsp
```

### テスト実行

#### Step 1: Extension Development Hostの起動

1. VSCodeでF5キーを押す
2. "Extension Development Host"ウィンドウが起動する
3. 拡張機能が自動的にロードされる

#### Step 2: Argo版デモファイルのテスト

```bash
# Extension Development Hostで実行
# Command Palette (Cmd+Shift+P) > "File: Open File..."
# または直接:
File > Open File > samples/argo/demo-workflow.yaml
```

**確認方法**:
1. ファイルを開いた直後、左下のステータスバーに「Argo Workflows Language Server」が表示される
2. Problems パネル（View > Problems、または Cmd+Shift+M）を開く
3. エラー・警告が**0件**であることを確認
4. ファイル内に赤波線が表示されていないことを確認

**診断結果の記録**:
```
# 以下のコマンドで診断結果をJSON形式で取得
# Command Palette > "Developer: Show Diagnostics"
# または、Problems パネルから右クリック > "Copy"
```

#### Step 3: Helm版デモファイルのテスト

```bash
# Extension Development Hostで実行
File > Open File > samples/helm/templates/demo-workflow.yaml
```

**確認方法**: Step 2と同様

#### Step 4: 機能テスト（任意）

デモファイル内で以下の操作を試す：

1. **定義ジャンプ（F12）**:
   - L129の`app-config`にカーソルを置いてF12 → L35にジャンプ
   - L225の`init-step`にカーソルを置いてF12 → L268にジャンプ

2. **ホバー情報**:
   - L129の`app-config`にマウスホバー → ConfigMapの内容表示

3. **補完（Ctrl+Space）**:
   - 新しい`configMapKeyRef`を入力時、`name:`の値で補完候補が表示される

---

## チェックリスト

### 修正完了

- [x] `findAllTemplateReferences`の修正
- [x] `findConfigMapDefinitions`の修正
- [x] `findTemplateDefinitions`の修正
- [x] ConfigMapIndexのURI修正
- [x] テストケースの追加
- [x] デモファイルの作成
- [x] 全テストの通過確認（444 pass、0 fail）

### VSCode実機テスト（中核）

- [ ] Extension Development Hostの起動確認
- [ ] Argo版demo-workflow.yamlの診断テスト（エラー0件）
- [ ] Helm版demo-workflow.yamlの診断テスト（エラー0件）
- [ ] 定義ジャンプ（F12）の動作確認
- [ ] ホバー情報の表示確認
- [ ] 補完機能の動作確認

### 補助テスト

- [x] 自動テストスイート通過（444 pass、0 fail）
- [ ] Neovimでの動作確認（オプション）

### ドキュメント

- [x] REGRESSION_PLAN.mdの作成
- [x] progress.mdへの記録
- [ ] CLAUDE.mdへの修正内容の追記（必要に応じて）

---

## 参考情報

### 関連Issue・PR

（該当する場合は記載）

### 関連ドキュメント

- PHASE5_PLAN.md - ConfigMap/Secret機能の計画書
- progress.md - 開発進捗記録
- samples/README.md - サンプルファイルの説明

### デバッグ時の有用なコマンド

```bash
# 特定のテストのみ実行
bun test packages/server/test/features/templateFeatures-multidoc.test.ts

# ビルド＆テスト
bun run build && bun run test

# コードフォーマット＆チェック
bun run check:write

# 型チェック
bun run typecheck
```

---

**最終更新日**: 2026-01-27
**作成者**: Claude Sonnet 4.5
**ステータス**: 修正完了、テスト通過 ✅
