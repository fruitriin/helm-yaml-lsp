import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

describe('Neovim Client', () => {
  test('should have Lua configuration file', async () => {
    const luaFilePath = join(__dirname, '..', 'lua', 'argo-workflows-lsp', 'init.lua');
    const luaFile = Bun.file(luaFilePath);

    expect(await luaFile.exists()).toBe(true);
  });

  test('should have test sample file', async () => {
    const testYamlPath = join(__dirname, '..', 'test.yaml');
    const testYaml = Bun.file(testYamlPath);

    expect(await testYaml.exists()).toBe(true);

    // test.yamlの内容をチェック
    const content = await testYaml.text();
    expect(content).toContain('apiVersion: argoproj.io/v1alpha1');
    expect(content).toContain('kind: Workflow');
  });

  test('should have README with setup instructions', async () => {
    const readmePath = join(__dirname, '..', 'README.md');
    const readme = Bun.file(readmePath);

    expect(await readme.exists()).toBe(true);

    const content = await readme.text();
    expect(content).toContain('nvim-lspconfig');
    expect(content).toContain('setup');
  });

  test('Lua module should be valid syntax', async () => {
    const luaFilePath = join(__dirname, '..', 'lua', 'argo-workflows-lsp', 'init.lua');
    const luaFile = Bun.file(luaFilePath);
    const content = await luaFile.text();

    // 基本的なLua構文チェック
    expect(content).toContain('local M = {}');
    expect(content).toContain('function M.setup');
    expect(content).toContain('return M');
    expect(content).toContain('lspconfig');
  });

  test('should work with nvim-lspconfig if available', async () => {
    // Neovimがインストールされているかチェック
    const nvimCheck = await new Promise<boolean>(resolve => {
      const nvim = spawn('nvim', ['--version']);
      nvim.on('error', () => resolve(false));
      nvim.on('close', code => resolve(code === 0));
    });

    if (!nvimCheck) {
      console.log('ℹ Neovim not installed, skipping Neovim-specific tests');
      return;
    }

    // nvim-lspconfigがインストールされているかチェック
    const lspconfigCheck = await new Promise<boolean>(resolve => {
      const nvim = spawn('nvim', [
        '--headless',
        '-c',
        "lua if pcall(require, 'lspconfig') then print('OK') else print('MISSING') end",
        '-c',
        'qall',
      ]);

      let output = '';
      nvim.stdout.on('data', data => {
        output += data.toString();
      });

      nvim.on('close', () => {
        resolve(output.includes('OK'));
      });
    });

    if (!lspconfigCheck) {
      console.log('ℹ nvim-lspconfig not installed, skipping integration tests');
      return;
    }

    // プラグインがロードできるかテスト
    const _serverPath = join(__dirname, '..', '..', 'server', 'dist', 'server.js');

    const testScript = `
-- テスト用スクリプト
vim.opt.runtimepath:append('${join(__dirname, '..')}')

local ok, argo_lsp = pcall(require, 'argo-workflows-lsp')
if ok then
    print('MODULE_LOADED')
else
    print('MODULE_FAILED')
end

vim.cmd('qall!')
`;

    const testResult = await new Promise<boolean>(resolve => {
      const nvim = spawn('nvim', ['--headless', '-c', `lua ${testScript}`]);

      let output = '';
      nvim.stdout.on('data', data => {
        output += data.toString();
      });

      nvim.on('close', () => {
        resolve(output.includes('MODULE_LOADED'));
      });

      // タイムアウト
      setTimeout(() => {
        nvim.kill();
        resolve(false);
      }, 5000);
    });

    expect(testResult).toBe(true);
  }, 10000);
});
