# .helmignore 対応 実装計画

## 背景

`isHelmTemplate()` は `/templates/` 配下 + `Chart.yaml` 存在でHelmテンプレートと判定するが、
`.helmignore` に記載されたファイルは除外すべき。現状は `.helmignore` を一切考慮していない。

## .helmignore 仕様

- **配置**: チャートルート（`Chart.yaml` と同階層）
- **フォーマット**: 1行1パターン、`#` でコメント
- **パターン構文**: Unix shell glob（`*`, `?`, `[a-z]` 等）
  - `**` は **非サポート**（Helm公式仕様）
  - `!` プレフィックスで否定（除外の除外）
  - `/` で始まるとチャートルートからの相対パス
  - `/` で終わるとディレクトリのみマッチ
  - パスセパレータなしのパターンは任意の深さでマッチ

## 変更対象ファイル

### 1. `packages/server/src/features/documentDetection.ts`

**変更内容**: `.helmignore` パターンの読み込み・マッチング・キャッシュ

```
isHelmTemplate(doc)
  ├── languageId === 'helm' → true（※ .helmignore チェックは不要）
  ├── !isYamlDocument → false
  ├── /templates/ 内でない → false
  ├── !hasChartYaml → false
  ├── isHelmIgnored(filePath, chartRoot) → false  ← 追加
  └── true
```

追加する関数:

- `findChartRoot(filePath: string): string | null`
  - `hasChartYaml` と同様に親を遡り、`Chart.yaml` があるディレクトリを返す
  - 既存の `hasChartYaml` のロジックを再利用（見つかったディレクトリを返すように拡張）

- `loadHelmIgnorePatterns(chartRoot: string): string[]`
  - `{chartRoot}/.helmignore` を読み込み、パターン配列を返す
  - 空行・コメント行を除外
  - ファイルが存在しなければ空配列

- `isHelmIgnored(filePath: string, chartRoot: string): boolean`
  - チャートルートからの相対パスに対して `.helmignore` パターンをマッチ
  - マッチ → `true`（= Helmとして扱わない）

**キャッシュ**:

```typescript
// チャートルート → .helmignore パターン配列
const helmIgnoreCache = new Map<string, string[]>();
```

`clearChartYamlCache()` 呼び出し時に `helmIgnoreCache` も同時クリア。
既存の公開関数名を `clearHelmDetectionCache()` にリネームしても良い。

### 2. `packages/server/src/server.ts`

**変更内容**: `.helmignore` ファイル変更時のキャッシュクリア

既にファイル変更監視があるので、`.helmignore` の変更もキャッシュクリアのトリガーに追加。

### 3. `packages/server/test/features/documentDetection.test.ts`

**追加テストケース**:

- `.helmignore` に `templates/configmap-helm.yaml` がある → `isHelmTemplate` が `false`
- `.helmignore` に `*.yaml` がある → templates 配下の全 YAML が除外
- `.helmignore` に `!templates/workflow.yaml` で否定 → そのファイルだけ除外されない
- `.helmignore` が存在しない → 従来通り（既存テストでカバー済み）
- `.helmignore` が空 → 従来通り

### 4. テスト用フィクスチャ（新規）

`samples/` のファイルは改変禁止のため、テストでは一時ディレクトリに動的に作成する。
`documentDetection.test.ts` は既にこのパターンを使用しているのでそれに倣う。

## パターンマッチの実装方針

### 選択肢

| 方法 | メリット | デメリット |
|------|----------|------------|
| A. `fast-glob` の `ignore` オプション | 既存依存、高機能 | ファイル走査が目的で、パターンマッチ単体での使用には不向き |
| B. `minimatch` / `picomatch` を新規追加 | glob マッチに特化 | 新規依存 |
| C. 自前実装（簡易 glob マッチ） | 依存なし | メンテ負荷、エッジケース |

### 推奨: A. `fast-glob` の `picomatch`（内部依存）を利用

`fast-glob` は内部で `picomatch` を使っている。
`picomatch` を直接 import できるかはバンドル構成次第だが、
`fast-glob` 自体の `isMatch` 的な使い方か、
別途 `picomatch`（軽量、0依存）を追加するのが安全。

ただし `.helmignore` は `**` 非サポートかつ基本的な glob のみなので、
**Node.js 標準の `path.matchesGlob()`**（Node 22+）も検討可能。
Bun が対応しているか要確認。

実用上は、`.helmignore` を使うケースは限定的なので、
`minimatch`（広く使われている）を1つ追加するのが最も堅実。

## 実装手順

1. パターンマッチライブラリの選定・追加（必要なら）
2. `documentDetection.ts` に `findChartRoot` / `loadHelmIgnorePatterns` / `isHelmIgnored` を追加
3. `isHelmTemplate` に `.helmignore` チェックを統合
4. `clearChartYamlCache` で helmignore キャッシュもクリア
5. `server.ts` に `.helmignore` ファイル変更監視を追加
6. テスト作成・実行
7. `bun run check:write` で整形

## 影響範囲

- `isHelmTemplate` の呼び出し元全てに波及（`setup.ts` のガード判定）
- `.helmignore` に記載されたファイルは「ただの YAML」として扱われる
  → Argo/ConfigMap ガードが適用される（意図通り）
- 既存の Helm テンプレートファイルの挙動は変わらない（`.helmignore` がなければ従来通り）

## 工数見積

小〜中規模。主な作業は `documentDetection.ts` への関数追加とテスト。
パターンマッチライブラリの選定が唯一の設計判断ポイント。
