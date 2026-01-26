# Argo Workflows LSP - Neovim Client

Phase 1の動作確認用最小設定。

## 必要な環境

- Neovim 0.8以上
- [nvim-lspconfig](https://github.com/neovim/nvim-lspconfig)
- Node.js 18以上

## セットアップ

### 1. サーバーをビルド

```bash
cd ../server
bun install
bun run build
```

### 2. Neovim設定に追加

`~/.config/nvim/init.lua` または適切な設定ファイルに以下を追加：

```lua
-- サーバーのパスを指定
local server_path = vim.fn.expand('~/path/to/helm-yaml-lsp/packages/server/dist/server.js')

-- nvim-client/lua をruntimepathに追加
vim.opt.runtimepath:append('~/path/to/helm-yaml-lsp/packages/nvim-client')

-- セットアップ
require('argo-workflows-lsp').setup({
    server_path = server_path,
    on_attach = function(client, bufnr)
        -- キーマップ設定
        local opts = { buffer = bufnr, noremap = true, silent = true }
        vim.keymap.set('n', 'gd', vim.lsp.buf.definition, opts)
        vim.keymap.set('n', 'K', vim.lsp.buf.hover, opts)
        vim.keymap.set('n', 'gr', vim.lsp.buf.references, opts)
        vim.keymap.set('n', '<leader>rn', vim.lsp.buf.rename, opts)
        vim.keymap.set('n', '<leader>ca', vim.lsp.buf.code_action, opts)
    end
})
```

### 3. YAMLファイルを開いてテスト

```bash
cd ~/path/to/helm-yaml-lsp/packages/nvim-client
nvim test.yaml
```

### 4. LSPが起動したか確認

Neovim内で以下のコマンドを実行：

```vim
:LspInfo
```

`argo_workflows_lsp` が表示され、`attached` 状態であればOKです。

## 動作確認

Phase 1では以下を確認：

- [x] サーバーが起動する
- [x] Neovimがサーバーに接続する
- [x] initialize/initialized メッセージが交換される
- [ ] ホバー機能（Phase 2以降で実装）
- [ ] 定義へ移動（Phase 2以降で実装）

## トラブルシューティング

### サーバーが見つからない

エラー: `[Argo LSP] Server not found: ...`

**解決策**: `server_path` を絶対パスで正しく指定してください。

```lua
local server_path = vim.fn.expand('~/workspace/helm-yaml-lsp/packages/server/dist/server.js')
```

### LSPが起動しない

1. サーバーがビルドされているか確認：

```bash
ls -la ../server/dist/server.js
```

2. ログレベルを上げて確認：

```lua
-- init.lua に追加
vim.lsp.set_log_level('debug')
```

3. LSPログの場所を確認：

```vim
:lua print(vim.lsp.get_log_path())
```

4. ログファイルを確認：

```bash
tail -f ~/.local/state/nvim/lsp.log
```

### サーバーの標準エラー出力を確認

サーバーは標準エラー出力にログを出力します：

```
[LSP] Initializing Argo Workflows Language Server
[LSP] Server initialized
```

これらのメッセージが LSPログファイルに表示されればOKです。

## 自動テスト

自動検証テストスクリプトを実行：

```bash
chmod +x test-plugin.sh
./test-plugin.sh
```

成功すると以下のメッセージが表示されます：

```
✓ Neovim plugin validation: PASSED
```

## 次のステップ

Phase 1完了後、Phase 2でコア機能を実装：

- Argo Workflows テンプレート定義への移動
- ホバー情報の表示
- パラメータ参照の解決
- Helm Values の参照
- ConfigMap/Secret の参照

詳細は `../../vscode-kubernetes-tools-argo/LSP_MIGRATION_PLAN.md` を参照してください。
