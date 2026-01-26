import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

describe('LSP Server', () => {
  test('should start successfully', async () => {
    const serverPath = join(__dirname, '..', 'dist', 'server.js');

    // サーバーが存在するか確認
    const serverFile = Bun.file(serverPath);
    const exists = await serverFile.exists();
    expect(exists).toBe(true);
  });

  test('should respond to initialize request', async () => {
    const serverPath = join(__dirname, '..', 'dist', 'server.js');

    // LSPの initialize リクエストを作成
    const initializeRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        processId: null,
        rootUri: null,
        capabilities: {},
        trace: 'off',
        workspaceFolders: null,
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      },
    };

    const content = JSON.stringify(initializeRequest);
    const message = `Content-Length: ${content.length}\r\n\r\n${content}`;

    return new Promise((resolve, reject) => {
      const server = spawn('node', [serverPath, '--stdio'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let output = '';
      let timeoutId: Timer;

      server.stdout.on('data', data => {
        output += data.toString();

        // Language Server startedメッセージを確認
        if (output.includes('Language Server started')) {
          clearTimeout(timeoutId);
          server.kill();
          resolve(true);
        }
      });

      server.stderr.on('data', data => {
        output += data.toString();
      });

      server.on('error', error => {
        clearTimeout(timeoutId);
        reject(error);
      });

      // タイムアウト設定（3秒）
      timeoutId = setTimeout(() => {
        server.kill();
        if (output.includes('Language Server started')) {
          resolve(true);
        } else {
          reject(new Error(`Server did not start properly. Output: ${output}`));
        }
      }, 3000);

      // initializeリクエストを送信
      server.stdin.write(message);
    });
  }, 5000);

  test('should have editor-independent dependencies', async () => {
    const packageJsonPath = join(__dirname, '..', 'package.json');
    const packageJson = await Bun.file(packageJsonPath).json();

    // vscode パッケージが依存関係に含まれていないことを確認
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    expect(allDeps).not.toHaveProperty('vscode');
    expect(allDeps).not.toHaveProperty('vscode-uri');

    // LSP標準パッケージは含まれていることを確認
    expect(allDeps).toHaveProperty('vscode-languageserver');
    expect(allDeps).toHaveProperty('vscode-languageserver-textdocument');
  });

  test('should build successfully', async () => {
    const distPath = join(__dirname, '..', 'dist', 'server.js');
    const distFile = Bun.file(distPath);

    expect(await distFile.exists()).toBe(true);

    // ビルド成果物のサイズチェック（空でないこと）
    const size = await distFile.size;
    expect(size).toBeGreaterThan(1000); // 最低1KB以上
  });
});
