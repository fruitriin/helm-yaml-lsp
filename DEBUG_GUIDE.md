# デバッグガイド

## F5でデバッグを開始する手順

### 1. デバッグ起動

1. VSCodeで `F5` キーを押すか、「実行とデバッグ」から **"Launch Extension"** を選択
2. **Extension Development Host** という新しいVSCodeウィンドウが開きます

### 2. ログの確認場所

ログは **2つの異なる場所** に表示されます：

#### A. メインVSCodeウィンドウ（開発環境側）

**デバッグコンソール**タブを開いてください：
- 表示 → デバッグコンソール
- または、下部パネルの「デバッグコンソール」タブをクリック

ここに **クライアント拡張のログ** が表示されます：
```
🚀 Argo Workflows LSP Extension is now activating...
📂 Server module path: /path/to/server/dist/server.js
🔍 Debug port: 6009
🔌 Starting Language Server client...
✅ Argo Workflows LSP Extension activated
```

#### B. Extension Development Hostウィンドウ（テスト環境側）

**出力パネル**を開いてください：
- 表示 → 出力
- または `Cmd+Shift+U` (macOS) / `Ctrl+Shift+U` (Windows/Linux)

右上のドロップダウンメニューから **"Argo Workflows Language Server"** を選択してください。

ここに **サーバー側のログ** が表示されます：
```
✅ Argo Workflows Language Server started and ready
✅ Argo Workflows Language Server initialized successfully
```

### 3. 拡張がアクティブか確認

Extension Development Hostウィンドウで以下を確認：

1. **通知の確認**
   - 右下に「Argo Workflows LSP activated successfully」という通知が表示されます
   - 見逃した場合は、ベルアイコンをクリックして通知履歴を確認

2. **コマンドパレット確認**
   - `Cmd+Shift+P` (macOS) または `Ctrl+Shift+P` (Windows/Linux)
   - 「Developer: Show Running Extensions」と入力
   - リストに「Argo Workflows LSP」が表示されていれば読み込まれています

### 4. LSP機能のテスト

Extension Development Hostウィンドウで：

1. `samples/test-workflow.yaml` を開く（なければYAMLファイルを作成）
2. 任意の箇所にマウスをホバー
   - 「Hello from Argo Workflows LSP!」というポップアップが表示されれば成功

3. **出力パネル**に以下のログが表示されます：
   ```
   Hover requested at position: 5:10
   ```

## トラブルシューティング

### ログが全く表示されない場合

**原因1: 拡張がまだアクティベートされていない**
- `onStartupFinished` は起動完了後に実行されるため、数秒待つ必要があります
- 5秒待ってもログが出ない場合、次の原因を確認

**原因2: デバッグコンソールを開いていない**
- メインVSCodeウィンドウの下部パネルで「デバッグコンソール」タブが選択されているか確認

**原因3: watchタスクが起動していない**
- `.vscode/tasks.json` の watch タスクが自動実行されているか確認
- 手動でビルド: `bun run build`

**原因4: ビルドファイルがない**
```bash
# 確認
ls -la packages/vscode-client/dist/extension.js
ls -la packages/server/dist/server.js

# なければビルド
bun run build
```

### サーバーのログが表示されない場合

1. Extension Development Hostウィンドウの「出力」パネルを開く
2. 右上のドロップダウンが **"Argo Workflows Language Server"** になっているか確認
3. 別のチャネル（例: "Extension Host" や "Tasks"）が選択されていると表示されません

### デバッグポートの競合

```
Error: listen EADDRINUSE: address already in use :::6009
```

以下のいずれかで解決：

**方法1: 環境変数で別ポートを指定**
```bash
export LSP_DEBUG_PORT=6010
```

**方法2: 既存プロセスを終了**
```bash
lsof -ti:6009 | xargs kill -9
```

## Client + Server 同時デバッグ

より詳細なデバッグには **"Client + Server"** 設定を使用：

1. 「実行とデバッグ」から **"Client + Server"** を選択
2. F5で起動
3. サーバー側にもブレークポイントを設定できます

サーバー側のconsole.log()も **デバッグコンソール** に表示されるようになります。

## ログレベルの調整

より詳細なLSPプロトコルのログを見る場合：

1. Extension Development Hostウィンドウで設定を開く
2. `argoWorkflowsLSP.trace.server` を検索
3. 値を `"verbose"` に変更
4. ウィンドウをリロード (`Cmd+R` / `Ctrl+R`)

「出力」パネルの "Argo Workflows Language Server" チャネルに詳細なプロトコルログが表示されます。
