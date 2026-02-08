# Phase 5 実装計画: ConfigMap/Secretサポート

**最終更新**: 2026-01-27

## 概要

Phase 4でHelm機能の実装が完了しました。Phase 5では、Argo WorkflowsおよびKubernetesで頻繁に使用されるConfigMap/Secretの参照機能を実装します。

**Phase 4完了時点での状態**:
- ✅ Argo Workflows LSP機能（Phase 2-3）
- ✅ Helm機能のフルサポート（Phase 4）
- ✅ 426 tests passed
- ⏸️ ConfigMap/Secret型定義は存在するが未実装

**Phase 5の目標**:
ConfigMap/Secretの定義と参照をサポートし、`configMapKeyRef`や`secretKeyRef`から定義へのジャンプ、補完、エラー検出を提供する。

---

## Phase 5.1: ConfigMap/Secret検出とインデックス化

### 目的

ワークスペース内のConfigMapとSecretリソースを検出し、インデックス化する。

### 実装内容

#### 5.1.1 ConfigMap/Secret検出

**ファイル**: `packages/server/src/features/configMapFeatures.ts`

**機能**:
- ConfigMap/Secret定義の検出
  - `kind: ConfigMap` の検出
  - `kind: Secret` の検出
  - `metadata.name` の抽出
  - `data` および `stringData` フィールドのキー抽出
- Helm template内のConfigMap/Secret検出
  - `{{ .Values.xxx }}` を含むConfigMap定義の処理

**型定義**:
```typescript
type ConfigMapDefinition = {
  name: string;                  // metadata.name
  kind: 'ConfigMap' | 'Secret';
  uri: string;                   // ファイルURI
  nameRange: Range;              // metadata.nameの位置
  keys: KeyDefinition[];         // dataキーのリスト
};

type KeyDefinition = {
  keyName: string;               // キー名
  range: Range;                  // キーの位置
  value?: string;                // 値（Secret以外）
};
```

**検出例**:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: argo
data:
  database-url: "postgresql://localhost:5432/mydb"
  api-endpoint: "https://api.example.com"
  config.yaml: |
    server:
      port: 8080
```

↓ インデックス化

```typescript
{
  name: "app-config",
  kind: "ConfigMap",
  uri: "file:///path/to/configmap-data.yaml",
  nameRange: { ... },
  keys: [
    { keyName: "database-url", range: { ... }, value: "..." },
    { keyName: "api-endpoint", range: { ... }, value: "..." },
    { keyName: "config.yaml", range: { ... }, value: "..." }
  ]
}
```

#### 5.1.2 ConfigMapインデックス

**ファイル**: `packages/server/src/services/configMapIndex.ts`

**機能**:
- ワークスペース内のConfigMap/Secretをインデックス化
- 名前空間ごとの管理（オプション）
- ファイル変更時の自動更新
- 高速な名前検索とキー検索

**主要メソッド**:
```typescript
class ConfigMapIndex {
  initialize(workspaceFolders: string[]): Promise<void>
  findConfigMap(name: string, kind: 'ConfigMap' | 'Secret'): ConfigMapDefinition | undefined
  findKey(configMapName: string, keyName: string): KeyDefinition | undefined
  getAllConfigMaps(kind?: 'ConfigMap' | 'Secret'): ConfigMapDefinition[]
  updateFile(uri: string): Promise<void>
  removeFile(uri: string): void
}
```

#### 5.1.3 実装タスク

- [ ] `findConfigMapDefinitions(document)` 実装 - ConfigMap/Secret定義検出
- [ ] `extractDataKeys(document, configMapDef)` 実装 - dataキー抽出
- [ ] `ConfigMapIndex` クラス作成
- [ ] ファイル監視との統合（ConfigMap/Secret変更検知）
- [ ] server.tsへの統合
- [ ] テスト作成（20+ tests）

#### 5.1.4 テスト内容

**テストファイル**: `packages/server/test/features/configMapFeatures.test.ts`

- ConfigMap定義の検出
- Secret定義の検出
- dataキーの抽出
- stringDataキーの抽出
- Helmテンプレート内のConfigMap検出
- 複数のConfigMapが存在する場合

**テストファイル**: `packages/server/test/services/configMapIndex.test.ts`

- インデックス初期化
- ConfigMap検索（名前）
- キー検索
- ファイル更新処理
- 複数名前空間の処理（オプション）

---

## Phase 5.2: ConfigMap/Secret参照の検出

### 目的

Workflowファイル内のConfigMap/Secret参照を検出し、参照の種類を識別する。

### 実装内容

#### 5.2.1 参照パターンの検出

**ファイル**: `packages/server/src/features/configMapReferenceFeatures.ts`

**機能**:
- 各種参照パターンの検出
- カーソル位置での参照抽出

**型定義**:
```typescript
type ConfigMapReference = {
  type: 'configMapKeyRef' | 'secretKeyRef' | 'configMapRef' | 'secretRef'
      | 'volumeConfigMap' | 'volumeSecret';
  referenceType: 'name' | 'key';
  name: string;                  // ConfigMap/Secret名
  keyName?: string;              // キー名（keyの場合のみ）
  kind: 'ConfigMap' | 'Secret';
  range: Range;                  // 参照の位置
};
```

**検出パターン**:

1. **configMapKeyRef** (env.valueFrom)
```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      configMapKeyRef:
        name: app-config      # nameへの参照
        key: database-url     # keyへの参照
```

2. **secretKeyRef** (env.valueFrom)
```yaml
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: app-secrets
        key: db-password
```

3. **configMapRef** (envFrom)
```yaml
envFrom:
  - configMapRef:
      name: app-config
```

4. **volumeConfigMap** (volumes)
```yaml
volumes:
  - name: config
    configMap:
      name: app-config
      items:
        - key: config.yaml    # keyへの参照
          path: app.yaml
```

5. **volumeSecret** (volumes)
```yaml
volumes:
  - name: secrets
    secret:
      secretName: app-secrets
      items:
        - key: db-password
          path: password.txt
```

#### 5.2.2 主要関数

```typescript
function findConfigMapReferenceAtPosition(
  document: TextDocument,
  position: Position
): ConfigMapReference | undefined

function findAllConfigMapReferences(
  document: TextDocument
): ConfigMapReference[]
```

#### 5.2.3 実装タスク

- [ ] `findConfigMapKeyRef(document, position)` 実装
- [ ] `findSecretKeyRef(document, position)` 実装
- [ ] `findConfigMapRef(document, position)` 実装
- [ ] `findVolumeConfigMap(document, position)` 実装
- [ ] `findVolumeSecret(document, position)` 実装
- [ ] カーソル位置での参照判定ロジック
- [ ] テスト作成（25+ tests）

#### 5.2.4 テスト内容

**テストファイル**: `packages/server/test/features/configMapReferenceFeatures.test.ts`

- configMapKeyRef の name 参照検出
- configMapKeyRef の key 参照検出
- secretKeyRef の参照検出
- configMapRef の参照検出
- volumeConfigMap の参照検出
- volumeSecret の参照検出
- ネストされた構造での参照検出
- カーソル位置判定の精度

---

## Phase 5.3: Definition Provider統合

### 目的

ConfigMap/Secret参照から定義へのジャンプ機能を提供する。

### 実装内容

#### 5.3.1 Definition Provider拡張

**ファイル**: `packages/server/src/providers/definitionProvider.ts`（拡張）

**機能**:
- `configMapKeyRef.name` から ConfigMap定義へジャンプ
- `configMapKeyRef.key` から data.keyへジャンプ
- `secretKeyRef` の同様のジャンプ
- ボリュームマウントの参照ジャンプ

**実装例**:

```typescript
// provideDefinition内に追加
const configMapRef = findConfigMapReferenceAtPosition(document, position);
if (configMapRef) {
  return this.handleConfigMapReference(configMapRef);
}

private handleConfigMapReference(
  ref: ConfigMapReference
): Location | null {
  if (!this.configMapIndex) {
    return null;
  }

  // name参照の場合：ConfigMap定義へジャンプ
  if (ref.referenceType === 'name') {
    const configMap = this.configMapIndex.findConfigMap(ref.name, ref.kind);
    if (configMap) {
      return Location.create(configMap.uri, configMap.nameRange);
    }
  }

  // key参照の場合：dataキーへジャンプ
  if (ref.referenceType === 'key' && ref.keyName) {
    const key = this.configMapIndex.findKey(ref.name, ref.keyName);
    if (key) {
      return Location.create(key.uri, key.range);
    }
  }

  return null;
}
```

#### 5.3.2 実装タスク

- [ ] Definition Providerに `configMapIndex` インジェクション
- [ ] `handleConfigMapReference` メソッド実装
- [ ] server.tsでの統合
- [ ] テスト作成（15+ tests）

#### 5.3.3 テスト内容

**プロバイダー統合テスト**: `packages/server/test/providers/definitionProvider.test.ts`（追加）

- configMapKeyRef.name からConfigMap定義へのジャンプ
- configMapKeyRef.key からdataキーへのジャンプ
- secretKeyRef参照のジャンプ
- volumeConfigMap参照のジャンプ
- 存在しないConfigMap参照（null返却）
- 存在しないkey参照（null返却）

---

## Phase 5.4: Hover Provider統合

### 目的

ConfigMap/Secret参照にホバー時、詳細情報を表示する。

### 実装内容

#### 5.4.1 Hover Provider拡張

**ファイル**: `packages/server/src/providers/hoverProvider.ts`（拡張）

**機能**:
- name参照にホバー時、ConfigMap名と種類を表示
- key参照にホバー時、キー名と値（プレビュー）を表示
- Secret参照時は値を隠す

**表示例（ConfigMap name参照）**:
```markdown
**ConfigMap**: `app-config`
**Keys**: 3 keys defined

- database-url
- api-endpoint
- config.yaml
```

**表示例（ConfigMap key参照）**:
```markdown
**Key**: `database-url`
**ConfigMap**: `app-config`
**Value**: `postgresql://localhost:5432/mydb`
```

**表示例（Secret key参照）**:
```markdown
**Key**: `db-password`
**Secret**: `app-secrets`
**Value**: `[hidden]`
```

#### 5.4.2 実装タスク

- [ ] Hover Providerに `configMapIndex` インジェクション
- [ ] `handleConfigMapHover` メソッド実装
- [ ] Secretの値を隠す処理
- [ ] テスト作成（10+ tests）

#### 5.4.3 テスト内容

**プロバイダー統合テスト**: `packages/server/test/providers/hoverProvider.test.ts`（追加）

- ConfigMap name参照のホバー情報
- ConfigMap key参照のホバー情報
- Secret name参照のホバー情報（値は隠す）
- Secret key参照のホバー情報（値は隠す）
- 存在しない参照のホバー（null）

---

## Phase 5.5: Completion Provider統合

### 目的

ConfigMap/Secret名とキーの入力補完を提供する。

### 実装内容

#### 5.5.1 Completion Provider拡張

**ファイル**: `packages/server/src/providers/completionProvider.ts`（拡張）

**機能**:
- `configMapKeyRef.name:` で ConfigMap名を補完
- `configMapKeyRef.key:` で dataキーを補完
- `secretKeyRef.name:` で Secret名を補完
- `volumeConfigMap.name:` で ConfigMap名を補完

**補完例（name補完）**:
```yaml
configMapKeyRef:
  name: |        # ← カーソル位置
        ↓
- app-config (ConfigMap)
- app-secrets (Secret)
```

**補完例（key補完）**:
```yaml
configMapKeyRef:
  name: app-config
  key: |         # ← カーソル位置
       ↓
- database-url
- api-endpoint
- config.yaml
```

#### 5.5.2 実装タスク

- [ ] Completion Providerに `configMapIndex` インジェクション
- [ ] ConfigMap名の補完コンテキスト検出
- [ ] キー名の補完コンテキスト検出
- [ ] `provideConfigMapNameCompletion` メソッド実装
- [ ] `provideConfigMapKeyCompletion` メソッド実装
- [ ] テスト作成（15+ tests）

#### 5.5.3 テスト内容

**プロバイダー統合テスト**: `packages/server/test/providers/completionProvider.test.ts`（追加）

- ConfigMap name補完（configMapKeyRef）
- Secret name補完（secretKeyRef）
- ConfigMap key補完（configMapKeyRef）
- volumeConfigMap name補完
- 補完候補のフィルタリング

---

## Phase 5.6: Diagnostics統合

### 目的

存在しないConfigMap/Secret参照や存在しないキー参照を検出する。

### 実装内容

#### 5.6.1 Diagnostics Provider拡張

**ファイル**: `packages/server/src/providers/diagnosticProvider.ts`（拡張）

**機能**:
- 存在しないConfigMap/Secret名の検出
- 存在しないdataキーの検出
- エラーメッセージの表示

**診断例**:
```yaml
configMapKeyRef:
  name: non-existent-config    # Error: ConfigMap 'non-existent-config' not found
  key: database-url
```

```yaml
configMapKeyRef:
  name: app-config
  key: non-existent-key        # Error: Key 'non-existent-key' not found in ConfigMap 'app-config'
```

#### 5.6.2 実装タスク

- [ ] Diagnostics Providerに `configMapIndex` インジェクション
- [ ] `validateConfigMapReferences` メソッド実装
- [ ] ConfigMap/Secret存在チェック
- [ ] キー存在チェック
- [ ] テスト作成（15+ tests）

#### 5.6.3 テスト内容

**プロバイダー統合テスト**: `packages/server/test/providers/diagnosticProvider.test.ts`（追加）

- 存在しないConfigMap参照の検出
- 存在しないSecret参照の検出
- 存在しないキー参照の検出
- 正常な参照（エラーなし）
- 複数エラーの検出

---

## 実装順序の推奨

Phase 5の各サブフェーズは以下の順序で実装することを推奨します：

1. **Phase 5.1: ConfigMap/Secret検出とインデックス化** ← 基盤（必須）
2. **Phase 5.2: 参照の検出** ← 中核機能（必須）
3. **Phase 5.3: Definition Provider統合** ← 最重要機能（必須）
4. **Phase 5.4: Hover Provider統合** ← 補助機能（推奨）
5. **Phase 5.5: Completion Provider統合** ← 補助機能（推奨）
6. **Phase 5.6: Diagnostics統合** ← 補助機能（推奨）

---

## Phase 5完了基準

以下がすべて満たされた時点で Phase 5 完了とする：

- [ ] ConfigMap/Secret定義が検出され、インデックス化される
- [ ] configMapKeyRef.name から ConfigMap定義へジャンプできる
- [ ] configMapKeyRef.key から dataキーへジャンプできる
- [ ] secretKeyRef参照も同様にジャンプできる
- [ ] volumeConfigMap/volumeSecret参照がサポートされる
- [ ] ホバー情報が表示される（name、key）
- [ ] 入力補完が動作する（name、key）
- [ ] 存在しないConfigMap/key参照がエラー検出される
- [ ] 全テストが通過する（100+ tests想定、Phase 4の426 + 100 = 526+）
- [ ] ビルドが成功する
- [ ] VSCodeとNeovim両方で動作確認できる
- [ ] サンプルファイル（workflow-configmap.yaml）で全機能が動作する

---

## サンプルファイルの活用

Phase 5の動作確認には既存のサンプルファイルを使用：

- **samples/argo/configmap-data.yaml** - ConfigMap/Secret定義
- **samples/argo/workflow-configmap.yaml** - ConfigMap/Secret参照

追加サンプル（必要に応じて）：
- 複数のConfigMapを持つサンプル
- Helm template内のConfigMap
- 名前空間付きConfigMap（オプション）

---

## 技術的な考慮事項

### 名前空間の扱い

- 基本実装：名前空間を無視（同名のConfigMapは上書き）
- 拡張実装：metadata.namespaceを考慮（オプション）

### Helmテンプレート内のConfigMap

- `{{ .Values.xxx }}` を含むConfigMap定義の処理
- 完全な値が取得できない場合の処理

### パフォーマンス

- ConfigMapファイルは通常小さいため、パフォーマンス問題は少ない
- インデックス更新は差分のみ処理

### エディタ非依存性

- すべての機能でVSCode API依存を避ける
- LSP標準プロトコルのみを使用
- Node.js標準ライブラリを優先

---

## リスクと対応

### リスク1: YAML構造の複雑性

**リスク**: env、envFrom、volumes等、複数の場所にConfigMap参照が存在。

**対応**:
- パターンマッチングで各種参照を検出
- テストで全パターンをカバー

### リスク2: Helmテンプレート内のConfigMap

**リスク**: Helmテンプレート構文が含まれるConfigMapの解析が困難。

**対応**:
- 基本的なパターンのみサポート
- 複雑なテンプレートは段階的に対応

### リスク3: 名前空間の曖昧性

**リスク**: 異なる名前空間に同名のConfigMapが存在する可能性。

**対応**:
- Phase 5.1では名前空間を無視（シンプル実装）
- 将来的に名前空間サポートを追加（オプション）

---

## 成功指標

Phase 5が成功したと判断する指標：

1. **機能の完全性**
   - ConfigMap/Secret参照の全機能動作（Definition/Hover/Completion/Diagnostics）
   - 5種類の参照パターンすべてサポート

2. **品質**
   - 100+ tests passed（Phase 4の426 + 100 = 526+）
   - ビルド成功
   - エディタ非依存性維持（ESLint通過）

3. **実用性**
   - サンプルファイルで全機能動作
   - VSCodeとNeovim両方で動作確認
   - 実際のArgo Workflowsプロジェクトで使用可能

4. **ドキュメント**
   - CLAUDE.md更新
   - progress.md更新
   - サンプルファイルのREADME更新

---

## まとめ

Phase 5では、ConfigMap/Secretのサポートを実装します。これにより、Argo Workflowsでの開発体験がさらに向上します。

**Phase 5完了後のプロジェクト状態**:
- ✅ Argo Workflows LSP機能（Phase 2-3）
- ✅ Helm機能のフルサポート（Phase 4）
- ✅ ConfigMap/Secretのフルサポート（Phase 5）
- ✅ エディタ非依存（VSCode/Neovim）
- ✅ 526+ tests
- ✅ 実用レベルの言語サーバー

このフェーズの成功により、開発者はConfigMap/Secret参照の補完・ジャンプを活用でき、設定ミスを減らすことができます。

---

## 次のフェーズ候補

Phase 5完了後は以下を検討：

- **Phase 6**: 高度な機能
  - リファクタリング（リネーム）
  - コードアクション
  - ドキュメントシンボル
  - ワークスペースシンボル検索

- **Phase 7**: パフォーマンス最適化とリリース準備
  - プロファイリング
  - 最適化
  - ドキュメント整備
  - デモ動画作成
  - VSCode Marketplace公開
