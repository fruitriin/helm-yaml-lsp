-- Argo Workflows LSP - Neovim Client
-- Phase 1: 最小限のLSP設定

local M = {}

--- Setup function for Argo Workflows LSP
--- @param opts table|nil Configuration options
---   - server_path: string (required) Path to the LSP server executable
---   - on_attach: function|nil Custom on_attach callback
---   - capabilities: table|nil LSP client capabilities
---   - settings: table|nil LSP server settings
function M.setup(opts)
	opts = opts or {}

	-- サーバーパスの解決
	local server_path = opts.server_path
	if not server_path then
		-- デフォルト: 相対パスから推測
		local current_file = debug.getinfo(1, "S").source:sub(2)
		local plugin_root = vim.fn.fnamemodify(current_file, ":h:h:h")
		server_path = plugin_root .. "/../server/dist/server.js"
	end

	-- サーバーが存在するかチェック
	if vim.fn.filereadable(server_path) == 0 then
		vim.notify(
			string.format("[Argo LSP] Server not found: %s", server_path),
			vim.log.levels.ERROR
		)
		return
	end

	-- LSP設定
	local lspconfig = require("lspconfig")
	local configs = require("lspconfig.configs")

	if not configs.argo_workflows_lsp then
		configs.argo_workflows_lsp = {
			default_config = {
				cmd = { "node", server_path, "--stdio" },
				filetypes = { "yaml", "yaml.helm" },
				root_dir = function(fname)
					return lspconfig.util.root_pattern("Chart.yaml", ".git", "kustomization.yaml")(fname)
						or vim.fn.getcwd()
				end,
				settings = {
					argoWorkflowsLSP = {
						maxNumberOfProblems = 1000,
						enableHover = true,
						enableDefinition = true,
						enableCompletion = true,
						enableDiagnostics = true,
					},
				},
				single_file_support = true,
			},
		}
	end

	-- サーバー起動
	lspconfig.argo_workflows_lsp.setup({
		on_attach = opts.on_attach
			or function(client, bufnr)
				vim.notify(
					string.format("[Argo LSP] Attached to buffer %d (client: %s)", bufnr, client.name),
					vim.log.levels.INFO
				)
			end,
		capabilities = opts.capabilities,
		settings = opts.settings,
	})

	vim.notify("[Argo LSP] Setup complete", vim.log.levels.INFO)
end

return M
