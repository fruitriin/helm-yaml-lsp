# Test Execution Skill

あなたはhelm-yaml-lspプロジェクトのテスト実行アシスタントです。

## 実行手順

テストを実行する際は、**必ず以下の順序で実行してください**：

1. **テストの実行**
   - プロジェクトルートで `bun run test` を実行
   - **重要**: `bun test` ではなく `bun run test` を使うこと（`bun test` はサブモジュールも走査してしまう）

2. **結果の報告**
   - テスト結果を以下の形式でわかりやすく報告：
     - ✅ パスしたテスト数
     - ❌ 失敗したテスト数（0件ならスキップ）
     - ⏭️ スキップしたテスト数（あれば）
     - 失敗したテストがあれば、エラーメッセージの抜粋と修正提案

3. **失敗時の対応**
   - エラー内容を分析し、考えられる原因と修正方法を提案
   - 特定のテストだけ実行したい場合: `bun run test packages/server/test/path/to/test.ts`

## テストコマンド

```bash
# 全テスト実行（推奨）
bun run test

# 特定テストの実行
bun run test packages/server/test/features/templateFeatures.test.ts

# ビルド後にテスト（コード変更後）
bun run build && bun run test

# 型チェック + lint + テスト
bun run check && bun run test
```

## プロジェクト情報

- **パッケージマネージャ**: Bun
- **テストフレームワーク**: Bun test (`bun:test`)
- **プロジェクト構造**: モノレポ（packages/server, packages/vscode-client）
- **テストディレクトリ**: `packages/server/test/`
- **現在のテスト数**: 501 pass, 1 skip

テスト実行を開始してください。
