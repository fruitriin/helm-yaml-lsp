# デバッグ起動手順

## 前提条件

`bun run watch` が動いていること（別ターミナルで実行中）。

## ステップ1: VSCodeでF5を押す

1. このプロジェクト（helm-yaml-lsp）のVSCodeウィンドウに戻る
2. `F5` キーを押す
3. または、左サイドバーの「実行とデバッグ」アイコン → 「Launch Extension」→ 緑の再生ボタン

## ステップ2: Extension Development Hostウィンドウが開く

新しいVSCodeウィンドウ（タイトルに "Extension Development Host" と表示）が開きます。

## ステップ3: ログを確認

### A. メインVSCodeウィンドウ（このウィンドウ）

1. 下部パネルの **「デバッグコンソール」** タブをクリック
2. 以下のようなログが表示されるはずです：

```
🚀 Argo Workflows LSP Extension is now activating...
📂 Server module path: /Users/riin/workspace/helm-yaml-lsp/packages/server/dist/server.js
🔍 Debug port: 6009
🔌 Starting Language Server client...
✅ Argo Workflows LSP Extension activated
✅ Argo Workflows Language Server is ready!
```

### B. Extension Development Hostウィンドウ

1. メニュー「表示」→「出力」（または `Cmd+Shift+U`）
2. 右上のドロップダウンメニューで **「Argo Workflows Language Server」** を選択
3. 以下のログが表示されます：

```
🚀 Argo Workflows Language Server starting...
👂 Document manager listening...
✅ Argo Workflows Language Server is now listening for client connections
📋 Server initialization phase...
  ✓ Configuration capability enabled
  ✓ Workspace folder capability enabled
✅ Argo Workflows Language Server initialized successfully
```

4. 右下に通知 **「Argo Workflows LSP activated successfully」** が表示されます

## ステップ4: 動作確認

Extension Development Hostウィンドウで：

1. `ファイル` → `フォルダーを開く` → このプロジェクトの `samples` フォルダを選択
2. `test-workflow.yaml` を開く
3. 任意の箇所にマウスをホバー
4. **「Hello from Argo Workflows LSP!」** というポップアップが表示されれば成功！

## プロセス確認

別のターミナルで確認：

```bash
# Language Serverプロセスを確認
ps aux | grep "server.js" | grep helm-yaml-lsp
```

このコマンドで何か表示されれば、サーバーが起動しています。

## トラブルシューティング

### ログが表示されない

- 5秒程度待ってください（`onStartupFinished` は起動完了後に実行されます）
- Extension Development Host ウィンドウで YAMLファイルを開いてみてください

### "Watch task has not started yet"

`.vscode/tasks.json` の watch タスクが起動していません：

1. `Cmd+Shift+P` → 「Tasks: Run Task」
2. 「watch」を選択

または、先に `bun run watch` を実行しておいてください。

### ポートが使用中

```bash
# ポート6009を使用しているプロセスを確認
lsof -i :6009

# 必要なら終了
lsof -ti:6009 | xargs kill -9
```

## 次のステップ

デバッグが成功したら：

1. server.ts や extension.ts にブレークポイントを設定
2. コードをステップ実行してデバッグ
3. 変更を加えて `bun run watch` が自動再コンパイルするのを確認
4. Extension Development Host をリロード（`Cmd+R`）して変更を反映
