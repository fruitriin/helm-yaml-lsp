# Phase 7 実装に関する推奨事項

**最終更新**: 2026-02-06

Phase 7の実装にあたり、5つの検討事項について具体的な推奨案を提示します。

---

## 1. 優先度と実装順序

### 提案A: 段階的アプローチ（推奨）⭐

**実装順序**:
```
Phase 6完了
    ↓
Phase 7.0: プロトタイプ（1〜2週間）
    ↓
フィードバック収集・設計見直し
    ↓
Phase 7.1〜7.3: コア機能（3〜4週間）
    ↓
Phase 7.4: 増分更新（1〜2週間）
    ↓
Phase 7.5: UI/UX改善（オプション）
```

#### Phase 7.0: プロトタイプ（新規追加）

**目的**: 実現可能性の検証とアルゴリズムの評価

**最小限の実装**:
1. 単純なHelmテンプレート（条件分岐なし）で`helm template`を実行
2. LCSベースの行マッピングを実装
3. 展開後YAMLで1つの値から元の定義にジャンプ（PoC）
4. パフォーマンス測定（小/中/大規模Chartで）

**判断基準**:
- ✅ マッピング精度が80%以上 → Phase 7本格実装へ
- ⚠️ 精度が50〜80% → アルゴリズム見直し
- ❌ 精度が50%未満 → アプローチ再検討

**成果物**:
- `packages/server/src/experimental/templateMapping.ts`（実験的実装）
- パフォーマンスレポート
- 精度評価レポート

---

### 提案B: Phase 6.4完了後に着手

**タイミング**: IntelliJ Pluginのビルド・動作確認が完了してから

**理由**:
1. Phase 6が完全に完了すると、3つのエディタ（VSCode, Neovim, IntelliJ）すべてで基本機能が使える
2. Phase 7はより高度な機能のため、基盤を固めてから取り組む方が安全
3. Phase 6の実装で得られた知見をPhase 7に活かせる

**スケジュール案**:
```
2週間: Phase 6.4〜6.5完了（IntelliJ Plugin）
1週間: Phase 7.0プロトタイプ
3〜4週間: Phase 7.1〜7.3本実装
```

---

## 2. アルゴリズム選定

### 提案: ハイブリッドアプローチ（推奨）⭐

複数のアルゴリズムを組み合わせ、信頼度に応じて使い分ける。

#### 2.1 第一段階: Structural Anchoring（構造アンカー）

**概念**: 変化しない「アンカーポイント」を基準に位置を特定

**アンカーとなる要素**:
- `apiVersion`, `kind`（必ず固定）
- YAMLキー名（`metadata`, `spec`, `templates`等）
- インデントレベル

**アルゴリズム**:
```typescript
// 1. アンカーポイントを両方のファイルで抽出
const originalAnchors = [
  { line: 1, key: 'apiVersion', value: 'argoproj.io/v1alpha1' },
  { line: 2, key: 'kind', value: 'Workflow' },
  { line: 3, key: 'metadata' },
  { line: 5, key: 'spec' },
  { line: 6, key: 'templates' },
];

const renderedAnchors = [
  { line: 1, key: 'apiVersion', value: 'argoproj.io/v1alpha1' },
  { line: 2, key: 'kind', value: 'Workflow' },
  { line: 3, key: 'metadata' },
  { line: 5, key: 'spec' },
  { line: 6, key: 'templates' },
];

// 2. アンカー間の相対位置でマッピング
// 例: line 7 は spec（line 5）とtemplates（line 6）の間
//     → rendered の line 7 も同じ相対位置
```

**利点**:
- 高速（O(n)）
- 高精度（アンカーポイントは100%一致）
- 条件分岐にも対応可能（アンカーは残る）

---

#### 2.2 第二段階: Value Matching（値マッチング）

**概念**: Helm変数が展開された値を、元のテンプレート構文と対応付ける

**実装例**:
```typescript
// templates/workflow.yaml
const originalLine = '  name: {{ .Values.workflow.name }}';

// rendered/workflow.yaml
const renderedLine = '  name: my-workflow';

// 1. YAMLキーを抽出
const key = 'name'; // 両方で一致

// 2. 元のテンプレートでHelmテンプレート構文を検出
const helmTemplate = '{{ .Values.workflow.name }}';

// 3. values.yamlから値を取得
const valueFromValues = 'my-workflow'; // values.yaml:8

// 4. renderedLineの値と一致するか確認
if (renderedLine.includes(valueFromValues)) {
  // マッピング成功
  mapping = {
    renderedPosition: { line: 7, char: 8 },
    originalTemplate: helmTemplate,
    valuesPath: 'workflow.name',
    confidence: 0.95
  };
}
```

**対応するケース**:
- `.Values.*` 参照
- `{{ include }}` / `{{ template }}` 関数
- `.Chart.*`, `.Release.*` 変数

---

#### 2.3 第三段階: Fuzzy Matching（曖昧マッチング）

**概念**: 完全一致しない場合、類似度で対応付ける

**アルゴリズム**: Levenshtein距離 + LCS

```typescript
// 類似度スコア計算
function calculateSimilarity(str1: string, str2: string): number {
  // Helmテンプレート構文を除去して比較
  const normalized1 = str1.replace(/\{\{.*?\}\}/g, '');
  const normalized2 = str2;

  // Levenshtein距離を計算
  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLen = Math.max(str1.length, str2.length);

  return 1 - (distance / maxLen); // 0.0 ~ 1.0
}

// 使用例
const original = '  image: {{ .Values.image.repository }}:{{ .Values.image.tag }}';
const rendered = '  image: alpine:3.18';

const similarity = calculateSimilarity(original, rendered);
// → 0.75（許容範囲）
```

**しきい値**:
- `>= 0.9`: 高信頼度（そのまま使用）
- `0.7 ~ 0.9`: 中信頼度（警告付きで使用）
- `< 0.7`: 低信頼度（マッピング不可）

---

### 提案: アルゴリズムの優先順位

```
1. Structural Anchoring（構造アンカー）
   ↓ マッチング失敗
2. Value Matching（値マッチング）
   ↓ マッチング失敗
3. Fuzzy Matching（曖昧マッチング）
   ↓ 信頼度 < 0.7
4. マッピング不可（null を返す）
```

---

## 3. キャッシュ戦略

### 提案: 3層キャッシュ戦略（推奨）⭐

```
┌──────────────────────────────────────┐
│ L1: メモリキャッシュ（高速）         │  TTL: 5分
│  - 最近使用したマッピング           │
│  - サイズ制限: 10 Charts            │
└──────────────────────────────────────┘
              ↓ キャッシュミス
┌──────────────────────────────────────┐
│ L2: ファイルキャッシュ（永続）      │  TTL: 無制限
│  - ~/.cache/helm-yaml-lsp/          │  （values.yaml変更時に削除）
│  - 圧縮されたマッピングデータ       │
└──────────────────────────────────────┘
              ↓ キャッシュミス
┌──────────────────────────────────────┐
│ L3: 再生成                          │
│  - helm template 実行               │
│  - マッピング作成                   │
│  - L1/L2に保存                      │
└──────────────────────────────────────┘
```

#### 3.1 L1: メモリキャッシュ

**実装**:
```typescript
class MappingCache {
  private cache: Map<string, CachedMapping> = new Map();
  private maxSize = 10; // 最大10 Charts

  set(chartDir: string, mapping: SymbolMapping): void {
    // LRU: 最も古いものを削除
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(chartDir, {
      mapping,
      timestamp: Date.now(),
      ttl: 5 * 60 * 1000, // 5分
    });
  }

  get(chartDir: string): SymbolMapping | null {
    const cached = this.cache.get(chartDir);
    if (!cached) return null;

    // TTLチェック
    if (Date.now() - cached.timestamp > cached.ttl) {
      this.cache.delete(chartDir);
      return null;
    }

    return cached.mapping;
  }
}
```

---

#### 3.2 L2: ファイルキャッシュ

**保存場所**:
```
~/.cache/helm-yaml-lsp/
├── <chartDir-hash>/
│   ├── mapping.json.gz        # 圧縮されたマッピング
│   ├── rendered.yaml.gz       # 圧縮された展開結果
│   ├── metadata.json          # Chart情報
│   └── checksums.json         # ファイルチェックサム
```

**無効化条件**:
- `values.yaml`のチェックサムが変わったとき
- `Chart.yaml`のチェックサムが変わったとき
- `templates/*.yaml`のチェックサムが変わったとき

**実装**:
```typescript
class FileCache {
  private cacheDir = path.join(os.homedir(), '.cache', 'helm-yaml-lsp');

  async save(chartDir: string, mapping: SymbolMapping): Promise<void> {
    const hash = this.hashChartDir(chartDir);
    const dir = path.join(this.cacheDir, hash);

    await fs.mkdir(dir, { recursive: true });

    // 圧縮して保存
    const compressed = await gzip(JSON.stringify(mapping));
    await fs.writeFile(path.join(dir, 'mapping.json.gz'), compressed);

    // チェックサム保存
    await this.saveChecksums(chartDir, dir);
  }

  async load(chartDir: string): Promise<SymbolMapping | null> {
    const hash = this.hashChartDir(chartDir);
    const dir = path.join(this.cacheDir, hash);

    // チェックサム検証
    if (!await this.validateChecksums(chartDir, dir)) {
      return null; // キャッシュ無効
    }

    // 読み込み・展開
    const compressed = await fs.readFile(path.join(dir, 'mapping.json.gz'));
    const json = await gunzip(compressed);
    return JSON.parse(json.toString());
  }
}
```

---

#### 3.3 キャッシュ無効化戦略

**トリガー**:
1. **手動**: コマンド `Helm: Clear Cache` でユーザーが手動クリア
2. **自動**: ファイル監視で変更検知
   - `values.yaml` 保存時
   - `Chart.yaml` 保存時
   - `templates/*.yaml` 保存時

**Debouncing**:
- 連続した変更を1つにまとめる（300ms待機）
- バックグラウンドで再生成

```typescript
class CacheInvalidator {
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  invalidate(chartDir: string): void {
    // 既存のタイマーをクリア
    const existingTimer = this.debounceTimers.get(chartDir);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 新しいタイマーをセット
    const timer = setTimeout(() => {
      this.regenerateMapping(chartDir);
      this.debounceTimers.delete(chartDir);
    }, 300); // 300ms

    this.debounceTimers.set(chartDir, timer);
  }
}
```

---

## 4. エラーハンドリング

### 提案: グレースフルデグラデーション（推奨）⭐

**原則**: エラーが発生しても、基本機能は動作し続ける

#### 4.1 Helm未インストール

**検出**:
```typescript
async function checkHelmAvailability(): Promise<boolean> {
  try {
    const { stdout } = await exec('helm version --short');
    return stdout.includes('v3.'); // Helm v3以上が必要
  } catch (error) {
    return false;
  }
}
```

**対応**:
```typescript
if (!await checkHelmAvailability()) {
  // 警告を表示（1回のみ）
  connection.window.showWarningMessage(
    'Helm is not installed. Template rendering features will be disabled. ' +
    'Install Helm v3+ to enable these features.',
    { title: 'Install Helm' },
    { title: 'Dismiss' }
  );

  // Phase 7機能を無効化（Phase 1-6は動作）
  this.templateRenderingEnabled = false;
  return;
}
```

---

#### 4.2 helm template 実行失敗

**エラーケース**:
- Chart構文エラー
- values.yamlの不正なYAML
- 存在しないテンプレート参照

**対応**:
```typescript
async function renderTemplate(chartDir: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await exec(
      `helm template my-release ${chartDir}`,
      { timeout: 10000 } // 10秒タイムアウト
    );

    if (stderr && stderr.includes('Error')) {
      // Helmエラーを診断として表示
      this.showHelmError(stderr);
      return null;
    }

    return stdout;
  } catch (error) {
    // エラーログ記録（デバッグ用）
    console.error('[HelmTemplateExecutor] Rendering failed:', error);

    // 古いキャッシュがあれば使用（ベストエフォート）
    const cached = await this.fileCache.load(chartDir);
    if (cached) {
      connection.window.showInformationMessage(
        'Using cached template rendering (update failed)'
      );
      return cached.renderedYaml;
    }

    return null;
  }
}
```

**診断表示**:
```typescript
function showHelmError(stderr: string): void {
  // Helmエラーをパースして診断に変換
  const errorMatch = stderr.match(/Error: (.+?) in (.+?):(\d+)/);
  if (errorMatch) {
    const [, message, file, line] = errorMatch;

    // LSP診断として表示
    connection.sendDiagnostics({
      uri: filePathToUri(file),
      diagnostics: [{
        severity: DiagnosticSeverity.Error,
        range: { start: { line: +line - 1, character: 0 }, end: { line: +line, character: 0 } },
        message: `Helm Template Error: ${message}`,
        source: 'helm-yaml-lsp'
      }]
    });
  }
}
```

---

#### 4.3 マッピング失敗

**原因**:
- 複雑な条件分岐
- 大量のinclude関数
- 低い類似度スコア

**対応**:
```typescript
function findOriginalPosition(
  renderedPosition: Position,
  mapping: SymbolMapping
): Position | null {
  const token = mapping.findTokenAtPosition(renderedPosition);

  if (!token) {
    // マッピングが見つからない → 基本機能にフォールバック
    return null; // Phase 1-6の機能を使用
  }

  if (token.confidence < 0.7) {
    // 信頼度が低い → 警告付きで使用
    connection.window.showWarningMessage(
      'Symbol mapping has low confidence. Jump target may be inaccurate.'
    );
  }

  return token.originalPosition;
}
```

---

## 5. スコープ

### 提案: MVP（Minimum Viable Product）アプローチ（推奨）⭐

#### Phase 7.0〜7.3: MVP（最小限の価値ある製品）

**サポート対象**:
- ✅ 単純な`.Values`参照
- ✅ 固定値の展開
- ✅ 基本的なYAML構造
- ❌ 条件分岐（`{{ if }}`）→ Phase 7.4以降
- ❌ `{{ range }}`ループ → Phase 7.4以降
- ❌ 複雑な`include`関数 → Phase 7.4以降

**サンプルファイル**:
```yaml
# templates/workflow.yaml（MVP対応）
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: {{ .Values.workflow.name }}
  namespace: {{ .Values.namespace }}
spec:
  entrypoint: main
  templates:
    - name: {{ .Values.template.name }}
      container:
        image: {{ .Values.image.repository }}:{{ .Values.image.tag }}
        command: [{{ .Values.command }}]
```

**理由**:
1. 80%のユースケースをカバー
2. 早期にフィードバックを得られる
3. アルゴリズムの検証に十分

---

#### Phase 7.4以降: フル機能

**追加サポート**:
- ✅ 条件分岐（`{{ if }}/{{ else }}/{{ end }}`）
- ✅ ループ（`{{ range }}`）
- ✅ 複雑な`include`関数
- ✅ `with`ブロック
- ✅ カスタム関数

**実装戦略**:
```typescript
// 条件分岐の追跡
class ConditionalBlockTracker {
  track(templateContent: string): ConditionalBlock[] {
    // {{ if }}...{{ else }}...{{ end }} を検出
    const blocks: ConditionalBlock[] = [];

    // values.yamlから条件を評価
    // 展開された分岐を特定
    // マッピングに追加

    return blocks;
  }
}
```

---

### スコープの段階的拡大

```
Phase 7.0-7.3: MVP
├─ .Values参照（80%のケース）
├─ 固定値
└─ 基本的なYAML構造

Phase 7.4: 条件分岐
├─ {{ if }}
├─ {{ else }}
└─ {{ end }}

Phase 7.5: ループと高度な機能
├─ {{ range }}
├─ {{ with }}
└─ 複雑なinclude
```

---

## まとめ: 推奨実装プラン

### フェーズ1: プロトタイプ（1〜2週間）

- Phase 7.0を実装
- MVPスコープで実現可能性を検証
- Structural Anchoring + Value Matchingで精度測定

### フェーズ2: コア機能（3〜4週間）

- Phase 7.1〜7.3を実装
- 3層キャッシュ戦略を導入
- グレースフルデグラデーション実装

### フェーズ3: 拡張機能（2〜3週間）

- Phase 7.4: 増分更新
- 条件分岐のサポート追加

### フェーズ4: UI/UX（オプション）

- Phase 7.5: CodeLens, Diagnostics

---

## 判断基準

### プロトタイプ後の判断

| 精度 | パフォーマンス | 判断 |
|------|--------------|------|
| >= 80% | < 3秒 | ✅ 本格実装へ進む |
| >= 80% | >= 3秒 | ⚠️ パフォーマンス改善後に進む |
| 60-80% | < 3秒 | ⚠️ アルゴリズム改善後に進む |
| < 60% | - | ❌ アプローチ再検討 |

---

## 次のアクション

1. ✅ Phase 6.4〜6.5を完了（IntelliJ Plugin）
2. ✅ Phase 7.0プロトタイプの実装開始
3. ⏸️ プロトタイプ評価レポート作成
4. ⏸️ 本格実装の判断

---

**推奨**: まずPhase 7.0プロトタイプで実現可能性を確認してから、本格実装に進むことを強く推奨します。
