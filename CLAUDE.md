# Helm YAML LSP

Helm内に書かれたArgo Workflows YAMLに対してLSP機能を提供するプロジェクト。

**テスト**: 728 pass, 1 skip（48ファイル） | **Phase 1〜11 完了**

## コマンド

```bash
bun run test                # テスト実行（※ bun test は不可: サブモジュール走査される）
bun run build               # 全パッケージビルド
bun run check:write         # Biome自動修正（format + lint）
bun run check               # TypeScript型チェック + Biome
```

## 絶対原則

1. **エディタ非依存** — VSCode API (`vscode.*`) 一切禁止。`vscode-languageserver` のみ
2. **`type` > `interface`** — Biomeルール
3. **`@/` エイリアス** — `packages/server/src/` を指す。相対パス `../../../` は使わない
4. **`bun run test`** — `bun test` はサブモジュールも走査するので不可
5. **フィクスチャ不変** — `samples/` のYAMLは改変禁止。テスト失敗時はコードを修正する

## コーディングルール

```typescript
// インポート順序: Node.js → 外部 → @/ エイリアス（Biomeが自動ソート）
import * as path from 'node:path';
import type { Range } from 'vscode-languageserver-types';
import { ArgoTemplateIndex } from '@/services/argoTemplateIndex';

// type を使う（interface ではなく）
type TemplateDefinition = { name: string; range: Range };
```

- **型import**: `import type { Foo } from 'bar'`
- **未使用変数**: `_` プレフィックス
- **Biome**: インポート順を自動ソートする — 手動で並び替えない

## 参考ドキュメント

- **PHASE{1..11}_PLAN.md** — 各Phase設計計画
- **progress.md** — 進捗記録
- [LSP仕様](https://microsoft.github.io/language-server-protocol/) / [Argo Workflows](https://argoproj.github.io/argo-workflows/) / [Bun](https://bun.sh/docs) / [Biome](https://biomejs.dev/)
