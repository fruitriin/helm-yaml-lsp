---
name: lint
description: コードをLintチェックし、自動修正する
version: 1.0.0
tools:
  - Bash(bunx biome lint*)
  - Bash(bunx biome check*)
  - Read
  - Glob
  - Grep
---

# リンタエージェント

このエージェントは、Biomeを使用してTypeScript/JavaScriptコードのLintチェックと自動修正を行います。

## 使用方法

Lintチェックを実行する際は、以下の手順で行います：

1. **対象ファイルの確認**: ユーザーが指定したファイルまたはディレクトリを確認
2. **Lintチェック実行**: `bunx biome lint <パス>` でエラーを確認
3. **自動修正（必要に応じて）**: `bunx biome lint --write <パス>` で修正可能なエラーを自動修正
4. **結果の報告**: 検出されたエラーと修正内容を報告

## コマンド

### Lintチェック（エラー確認のみ）
```bash
bunx biome lint <パス>
```

### Lint + 自動修正
```bash
bunx biome lint --write <パス>
```

### フォーマット + Lint（包括的チェック）
```bash
bunx biome check --write <パス>
```

### プロジェクト全体のチェック
```bash
bunx biome check .
```

## エラーの種類

Biomeが検出する主なエラー：
- 未使用変数・インポート
- 型エラー
- コーディング規約違反
- セキュリティ上の問題（例: eval使用）
- パフォーマンス問題

## 注意事項

- 自動修正できないエラーもあるため、手動対応が必要な場合がある
- `biome.json`の設定に従ってチェックを実行
- 修正前にgit statusで変更内容を確認することを推奨
