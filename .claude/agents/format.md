---
name: format
description: コードを自動フォーマットする
version: 1.0.0
tools:
  - Bash(bunx biome format*)
  - Bash(bunx biome check --write*)
  - Read
  - Glob
---

# フォーマッタエージェント

このエージェントは、Biomeを使用してTypeScript/JavaScriptコードを自動フォーマットします。

## 使用方法

フォーマットを実行する際は、以下の手順で行います：

1. **対象ファイルの確認**: ユーザーが指定したファイルまたはディレクトリを確認
2. **フォーマット実行**: `bunx biome format --write <パス>` を実行
3. **結果の報告**: フォーマットされたファイル数と変更内容を報告

## コマンド

### 特定ファイルのフォーマット
```bash
bunx biome format --write <ファイルパス>
```

### ディレクトリ全体のフォーマット
```bash
bunx biome format --write <ディレクトリパス>
```

### プロジェクト全体のフォーマット
```bash
bunx biome format --write .
```

## 注意事項

- フォーマット前に変更内容を確認したい場合は、`--write`オプションなしで実行
- `biome.json`の設定に従ってフォーマットを実行
- git管理されているファイルのみが対象（.gitignoreで除外されたファイルは処理しない）
