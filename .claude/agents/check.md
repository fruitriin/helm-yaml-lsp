---
name: check
description: コードの包括的なチェック（フォーマット + Lint）を実行
version: 1.0.0
tools:
  - Bash(bunx biome check*)
  - Read
  - Glob
  - Grep
---

# コードチェックエージェント

このエージェントは、Biomeの`check`コマンドを使用して、フォーマットとLintの両方を一度に実行します。

## 使用方法

包括的なコードチェックを実行する際は、以下の手順で行います：

1. **対象ファイルの確認**: ユーザーが指定したファイルまたはディレクトリを確認
2. **チェック実行**: `bunx biome check <パス>` でエラーを確認
3. **自動修正（必要に応じて）**: `bunx biome check --write <パス>` で修正
4. **結果の報告**: フォーマットとLintの両方の結果を報告

## コマンド

### チェックのみ（変更なし）
```bash
bunx biome check <パス>
```

### チェック + 自動修正
```bash
bunx biome check --write <パス>
```

### プロジェクト全体のチェック
```bash
bunx biome check .
```

### CI/CD用（エラー時に終了コード1を返す）
```bash
bunx biome check --error-on-warnings .
```

## このエージェントの利点

- **効率的**: フォーマットとLintを1コマンドで実行
- **包括的**: コード品質の全体的なチェックが可能
- **CI/CD対応**: `--error-on-warnings`でビルドパイプラインに統合可能

## 実行タイミング

推奨される実行タイミング：
- コミット前
- プルリクエスト作成前
- CI/CDパイプライン
- コードレビュー前

## 注意事項

- 初回実行時は多数のエラーが報告される可能性がある
- 自動修正できないエラーは手動対応が必要
- git commitフック（pre-commit）での使用も推奨
