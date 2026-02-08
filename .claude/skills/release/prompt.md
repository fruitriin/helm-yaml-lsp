# Release Skill

最新バージョンのリリースを作成するスキル。引数でバージョンを指定するか、CHANGELOG.md の最新エントリから自動取得する。

## 使い方

```
/release              # CHANGELOG.md の最新バージョンでリリース
/release 0.19.0       # バージョン指定でリリース
```

## リリース手順

以下のステップを**順番に**実行する。各ステップの結果を確認してから次に進むこと。

### Step 1: バージョン決定

- 引数があればそのバージョンを使用
- なければ `CHANGELOG.md` の最初の `## [X.Y.Z]` から取得
- 現在の `package.json` のバージョンと比較し、既にリリース済みでないか確認

```bash
# CHANGELOG から最新バージョンを取得
grep -m1 '## \[' CHANGELOG.md | sed 's/.*\[\(.*\)\].*/\1/'

# 現在のバージョンを確認
grep '"version"' package.json | head -1
```

### Step 2: バージョンバンプ

3つの `package.json` すべてのバージョンを更新する：

- `package.json`（ルート）
- `packages/server/package.json`
- `packages/vscode-client/package.json`

**Edit ツール**で各ファイルの `"version": "旧バージョン"` を `"version": "新バージョン"` に変更する。

### Step 3: ビルド & テスト

```bash
# ビルド
bun run build

# テスト実行
bun run test
```

テストが失敗した場合はリリースを中止し、ユーザーに報告する。

### Step 4: VSIX パッケージング

```bash
cd packages/vscode-client
rm -f *.vsix
bun run package
```

- `bun run package` は内部で `cp ../../LICENSE . && bun run build && vsce package --no-dependencies` を実行する
- 生成された `.vsix` ファイル名を記録する

### Step 5: VSIX 検証

パッケージされた VSIX 内のバージョンが正しいことを確認：

```bash
cd packages/vscode-client
unzip -p *.vsix extension/package.json | grep '"version"'
```

バージョンが一致しない場合は中止する。

### Step 6: コミット

ユーザーに確認してからコミットする。

```bash
git add package.json packages/server/package.json packages/vscode-client/package.json
git commit -m "bump X.Y.Z"
```

### Step 7: タグ作成

```bash
git tag vX.Y.Z
```

### Step 8: プッシュ

ユーザーに確認してからプッシュする。

```bash
git push origin main --tags
```

### Step 9: GitHub Release 作成

CHANGELOG.md から該当バージョンのセクションを抽出し、リリースノートとして使用する。

```bash
# CHANGELOG からリリースノートを抽出（該当バージョンの ## から次の ## の手前まで）
```

リリース作成とVSIXアップロード：

```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z" \
  --notes-file /tmp/release-notes.md \
  packages/vscode-client/*.vsix
```

### Step 10: npm publish（helm-yaml-lsp-server）

#### 10a: README 生成

ルートの `README.md` を元に、npm パッケージ向けに **インストール＆利用方法にフォーカス** した README を生成し `packages/server/README.md` に配置する。

ブラッシュアップ方針：
- npm ユーザー向けに `npm install` で始まる利用手順を冒頭に置く
- Neovim / VSCode / その他エディタでの設定例を含める
- 開発者向けセクション（ビルド手順、プロジェクト構造、技術スタック）は削除または簡略化
- 機能一覧は維持する

```bash
# README が生成されたことを確認
ls -la packages/server/README.md
```

#### 10b: npm publish（dry-run で確認後）

```bash
cd packages/server

# まず dry-run で中身を確認
npm publish --dry-run

# ユーザーに確認してから本番公開
npm publish
```

- `files` フィールドに `README.md` が含まれていない場合、npm はパッケージルートの README.md を自動で含める
- バージョンが既に公開済みの場合はエラーになる。その場合はスキップする

### Step 11: 完了報告

以下を報告する：

- リリースバージョン
- リリース URL（`gh release view vX.Y.Z --json url -q .url`）
- VSIX ファイル名とサイズ
- npm パッケージ URL: `https://www.npmjs.com/package/helm-yaml-lsp-server`

## 注意事項

- **VSIX のゴミ除去**: パッケージング前に必ず `rm -f *.vsix` で古い VSIX を削除する（gitignore されたファイルは checkout 間で残留するため）
- **テスト必須**: テストが通らない限りリリースしない
- **ユーザー確認**: コミット・プッシュ・リリース作成・npm publish の前にユーザーに確認を取る
- **CHANGELOG 同期**: CHANGELOG.md にリリース内容が記載されていることを前提とする
- **npm README**: `packages/server/README.md` は毎リリース時にルート README から生成する（手動管理しない）
