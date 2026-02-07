# Phase 7 改善提案（残タスク）

**最終更新**: 2026-02-07

Phase 7（Helm Template Rendering）のコア実装は完了済み。
本ドキュメントは、未実装の改善項目をまとめたものである。

## 現在の実装状況

| 項目 | 状態 | 実装ファイル |
|------|------|-------------|
| 3段階ハイブリッドアルゴリズム | ✅ | `features/symbolMapping.ts` |
| L1メモリキャッシュ（5分TTL） | ✅ | `services/helmTemplateExecutor.ts` |
| Debounce無効化（300ms） | ✅ | `services/symbolMappingIndex.ts` |
| Helm CLI検出 | ✅ | `helmTemplateExecutor.isHelmAvailable()` |
| `# Source:` コメントからのファイル特定 | ✅ | `features/renderedYamlDetection.ts` |
| Definition/Hover Provider統合 | ✅ | `providers/definitionProvider.ts`, `hoverProvider.ts` |
| テスト | ✅ | 126テスト（6テストファイル） |

---

## 1. Helm未インストール時のユーザー通知

**優先度**: 高（実装コスト小、UX改善大）

**現状**: `isHelmAvailable()` が `false` を返すのみ。UIに通知されない。

**提案**: server.ts の初期化時に一度だけ警告を表示。

```typescript
// server.ts: initialized ハンドラー内
if (settings.enableTemplateRendering) {
  const available = await helmTemplateExecutor.isHelmAvailable();
  if (!available) {
    connection.window.showWarningMessage(
      'Helm CLI が見つかりません。テンプレートレンダリング機能は無効です。' +
      'Helm v3+ をインストールすると有効になります。'
    );
  }
}
```

**変更ファイル**: `server.ts`

---

## 2. Helmエラー → LSP診断変換

**優先度**: 高（ユーザーが「なぜレンダリングが効かないか」を知る手段がない）

**現状**: `helm template` が失敗すると `{ success: false, error }` を返すだけ。

**提案**: stderr をパースし、該当テンプレートファイルの該当行に `DiagnosticSeverity.Error` を表示。

```typescript
// helmTemplateExecutor.ts または diagnosticProvider.ts に追加
function parseHelmError(stderr: string, chartDir: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // パターン例: "Error: template: chart/templates/foo.yaml:12:5: ..."
  const pattern = /template:\s+\S+\/templates\/(\S+?):(\d+)(?::(\d+))?:\s*(.+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stderr)) !== null) {
    const [, file, line, col, message] = match;
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: Range.create(+line - 1, col ? +col - 1 : 0, +line - 1, 999),
      message: `Helm Template Error: ${message}`,
      source: 'helm-yaml-lsp',
    });
  }
  return diagnostics;
}
```

**変更ファイル**: `services/helmTemplateExecutor.ts`（stderrキャプチャ追加）、`providers/diagnosticProvider.ts`（診断統合）

---

## 3. L2ファイルキャッシュ（永続キャッシュ）

**優先度**: 中（大規模Chart利用者向け。冷間起動の高速化）

**現状**: LSP再起動時にマッピングが全て失われ、再構築が必要。

**提案**: `~/.cache/helm-yaml-lsp/` にチェックサムベースの永続キャッシュを導入。

```
~/.cache/helm-yaml-lsp/
├── <chartDir-hash>/
│   ├── mapping.json.gz    # 圧縮マッピング
│   └── checksums.json     # values.yaml + Chart.yaml + templates/*.yaml のハッシュ
```

**無効化条件**:
- `values.yaml` / `Chart.yaml` / `templates/*.yaml` のチェックサムが変わったとき

**実装方針**:
- `symbolMappingIndex.ts` の `getOrCreateMapping()` 内で L2 を参照
- `buildMapping()` 成功時に L2 に保存
- `invalidate()` 時に L2 も削除

**変更ファイル**: `services/symbolMappingIndex.ts`（L2統合）、新規: `utils/fileCache.ts`

---

## 4. 低信頼度マッピングの視覚的通知

**優先度**: 低

**現状**: confidence < 0.7 でもユーザーに通知なし。定義ジャンプやホバーが「静かに不正確」になりうる。

**提案**: ホバー表示時に confidence が低い場合、Markdown末尾に注記を追加。

```typescript
// hoverProvider.ts: handleRenderedYamlHover 内
if (result.confidence < 0.7) {
  markdown += '\n\n---\n*マッピング精度が低い可能性があります*';
}
```

**変更ファイル**: `providers/hoverProvider.ts`

---

## 5. 精度評価

**優先度**: 低（品質保証。機能開発ではない）

**提案**: 代表的なOSSチャート（bitnami/nginx、argo-workflows等）での精度測定スクリプト。

**評価指標**:
- マッピング成功率（全行のうちマッピングできた割合）
- 信頼度分布（exact / anchor / value / fuzzy の比率）
- パフォーマンス（レンダリング + マッピング構築の所要時間）

**成果物**: `scripts/evaluate-mapping.ts`（テストスクリプト）

---

## 実装順序の提案

```
1. Helm未インストール通知     （server.ts 数行追加）
2. Helmエラー→診断変換        （stderr解析 + 診断統合）
3. L2ファイルキャッシュ       （永続化層の追加）
4. 低信頼度通知               （ホバー注記）
5. 精度評価スクリプト          （品質保証）
```
