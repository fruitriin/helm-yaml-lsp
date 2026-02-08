# Language Server — 開発ガイド

## アーキテクチャ

```
src/
├── server.ts                    # エントリポイント
├── types/                       # 型定義 (argo.ts, index.ts, rendering.ts)
├── utils/                       # URI処理, ファイル操作, ロガー, fileCache
├── features/                    # 参照検出・YAML解析ロジック
│   ├── parameterFeatures.ts     #   パラメータ/artifact/result
│   ├── templateFeatures.ts      #   テンプレート定義・参照
│   ├── workflowVariables.ts     #   Workflow変数
│   ├── itemVariableFeatures.ts  #   Item変数
│   └── ...                      #   configMap, helm, chart, release, symbolMapping等
├── services/                    # インデックス・データ管理
│   ├── argoTemplateIndex.ts     #   テンプレート
│   ├── configMapIndex.ts        #   ConfigMap/Secret
│   ├── helmChartIndex.ts        #   Helmチャート
│   └── ...                      #   valuesIndex, symbolMappingIndex等
├── providers/                   # LSPリクエストハンドラー（6ファイル）
│   ├── definitionProvider.ts, hoverProvider.ts, completionProvider.ts
│   ├── diagnosticProvider.ts, documentSymbolProvider.ts, documentHighlightProvider.ts
└── references/                  # 統一参照解決アーキテクチャ
    ├── types.ts                 #   ReferenceKind, DetectedReference等
    ├── registry.ts              #   ガード付きハンドラーレジストリ
    ├── setup.ts                 #   ハンドラー登録（★ 優先順位はここで決まる）
    ├── handler.ts               #   ReferenceHandler インターフェース
    ├── formatters.ts            #   ホバーMarkdown生成（buildDescription）
    └── handlers/                #   10種のハンドラー実装
```

### ReferenceHandler パターン

```
Provider → ReferenceRegistry.detectAndResolve()
  → Guard (helm / configMap / argo)
    → Handler.detect() — 最初にマッチしたものが返る（配列順 = 優先順位）
      → Handler.resolve()
```

**ガード構成**（`setup.ts`）:

| ガード | ハンドラー（この順で試行） |
|--------|--------------------------|
| Helm | helmValues → helmTemplate → helmFunction → chartVariable → releaseCapabilities |
| ConfigMap | configMap |
| Argo | argoTemplate → argoParameter → workflowVariable → itemVariable |

**重要**: `detectAndResolve()` は最初にマッチしたハンドラーの結果を返す。`detect()` は「自分が担当する参照かどうか」を正確に判定する必要がある。曖昧なマッチは後続ハンドラーを阻害する。

---

## 既知のバグパターンと対策

### YAML テキスト解析（features/）

| パターン | 対策 |
|----------|------|
| インラインコメント混入 `name: val  # comment` | `stripYamlInlineComment()` |
| コメント行の誤マッチ `# {{inputs.parameters.x}}` | `line.trim().startsWith('#')` でスキップ |
| セクション終了誤判定（コメントが同インデント） | break条件に `!line.trim().startsWith('#')` を追加 |
| `exec()` が最初のマッチを返す | ループで全マッチを走査し最後のものを使用 |
| ブロック外のカーソルを誤検出 | `position.line` がブロック範囲内かを必ず検証 |
| 近接参照タイプの混同 | context-window → 構造的祖先探索に置換 |
| 同名リソースの上書き | `Map.set` → キーマージに変更 |

### Hover / Markdown 出力

| パターン | 対策 |
|----------|------|
| 項目間の改行が効かない | `join('  \n')` — Markdown hard line break（末尾スペース2個 + `\n`） |
| YAML `#` コメントがMarkdown見出しになる | `buildDescription()` で `\#` にエスケープ |
| コメント `##` を `substring(1)` すると `#` が残る | `replace(/^#+\s*/, '')` で全 `#` を除去 |

### Provider

| パターン | 対策 |
|----------|------|
| `selectionRange must be contained in fullRange` | `Range.end` の character を実際の行の長さで設定（`0` にしない） |
| `change.settings.xxx` で null crash | `change.settings?.xxx` — 常にオプショナルチェーン |

### ReferenceHandler

| パターン | 対策 |
|----------|------|
| ハンドラー優先順位による誤検出 | `setup.ts` の配列順を確認。`detect()` は担当外を確実にreject |
| 位置ベース検出が遠方のブロックにマッチ | 最も近いブロックを探索 + `position.line` が範囲内か検証 |

---

## 開発ワークフロー

### バグ修正（TDD）

1. **切り分け** — false positive? ビルド未反映? コードバグ?
2. **テスト作成** — バグを再現する最小YAML → **失敗を確認**
3. **修正** — `features/` のパーサー関数を修正
4. **検証** — `bun run test` 全パス → `bun run build` → IDE再起動確認

### 参照機能の追加

1. `references/types.ts` に `ReferenceKind` と `Details` 型追加
2. `features/xxxFeatures.ts` に検出ロジック実装
3. `references/handlers/xxxHandler.ts` に `ReferenceHandler` 実装
4. `references/setup.ts` の該当ガードに登録
5. 既存カテゴリなら既存ハンドラー拡張（例: artifact → `argoParameterHandler`）

### チームオーケストレーション（大規模実装）

- **共有ファイルがある機能は同一エージェントに**
- **完全独立な機能は別エージェントに**
- **Biome自動修正は最後にまとめて**: `bun run check:write`

---

## API メモ

```typescript
// URI変換 — uriToFilePath() は file:// URI 必須（生パス不可）
uriToFilePath('file:///path/to/file')  // → '/path/to/file'
filePathToUri('/path/to/file')         // → 'file:///path/to/file'

// HelmChartIndex — findChartByName() は存在しない
helmChartIndex.getAllCharts().find(c => c.name === name)

// createSymbolMapping の引数順序
createSymbolMapping(originalContent, renderedContent, originalUri, chartName, chartDir, relativePath)

// findOriginalPosition の戻り値 — originalLine ではない
{ line, character, confidence }
```

---

## 実装済み機能

### Argo Workflows（Phase 2-3, 8-10）
- テンプレート参照（direct / templateRef / clusterScope）
- パラメータ参照（`inputs/outputs.parameters`, `steps/tasks.outputs.parameters`）
- Artifact参照（`inputs/outputs.artifacts`, `steps/tasks.outputs.artifacts`）
- Script Result（`steps/tasks.outputs.result`）— 言語検出付き
- Workflow変数（`workflow.name`, `workflow.parameters.xxx`, `workflow.outputs.*`）
- Item変数（`{{item}}`, `{{item.xxx}}`）— withItems/withParam ソース検出

### Helm（Phase 4, 7, 11）
- `.Values.xxx` → values.yaml定義ジャンプ / ホバー / 補完 / 診断
- `include`/`template` → `define` ブロック / 組み込み関数70+
- `.Chart.*`, `.Release.*`, `.Capabilities.*`
- `helm template` レンダリング → オリジナルへの逆マッピング
- DocumentSymbol（YAMLアウトライン）/ DocumentHighlight（Helmブロック対応）

### ConfigMap/Secret（Phase 5）
- `configMapKeyRef` / `secretKeyRef` / `configMapRef` / `secretRef` / volume系
- name/key参照 → 定義ジャンプ / ホバー / 補完 / 診断
