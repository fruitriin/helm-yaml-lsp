import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

describe('Integration Tests', () => {
  test('all packages should be buildable', async () => {
    const serverDist = join(__dirname, '..', 'packages', 'server', 'dist', 'server.js');
    const clientDist = join(__dirname, '..', 'packages', 'vscode-client', 'dist', 'extension.js');

    expect(await Bun.file(serverDist).exists()).toBe(true);
    expect(await Bun.file(clientDist).exists()).toBe(true);
  });

  test('server should start and client should be able to connect', async () => {
    const serverPath = join(__dirname, '..', 'packages', 'server', 'dist', 'server.js');

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
          name: 'test-integration-client',
          version: '1.0.0',
        },
      },
    };

    const content = JSON.stringify(initializeRequest);
    const message = `Content-Length: ${content.length}\r\n\r\n${content}`;

    const result = await new Promise<boolean>((resolve, reject) => {
      const server = spawn('node', [serverPath, '--stdio'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let output = '';
      const timeoutId = setTimeout(() => {
        server.kill();
        resolve(output.includes('Language Server started'));
      }, 3000);

      server.stdout.on('data', data => {
        output += data.toString();
      });

      server.stderr.on('data', data => {
        output += data.toString();
      });

      server.on('error', error => {
        clearTimeout(timeoutId);
        reject(error);
      });

      server.stdin.write(message);
    });

    expect(result).toBe(true);
  }, 5000);

  test('project structure should be correct', async () => {
    const paths = [
      'packages/server/src/server.ts',
      'packages/vscode-client/src/extension.ts',
      'packages/nvim-client/lua/argo-workflows-lsp/init.lua',
      'packages/server/package.json',
      'packages/vscode-client/package.json',
      '.github/workflows/test-clients.yml',
      'biome.json',
      'tsconfig.json',
    ];

    for (const path of paths) {
      const filePath = join(__dirname, '..', path);
      const exists = await Bun.file(filePath).exists();
      expect(exists).toBe(true);
    }
  });

  test('no VSCode API dependencies in server', async () => {
    const serverPackageJson = await Bun.file(
      join(__dirname, '..', 'packages', 'server', 'package.json')
    ).json();

    const allDeps = {
      ...serverPackageJson.dependencies,
      ...serverPackageJson.devDependencies,
    };

    // VSCode APIへの依存がないことを確認
    expect(allDeps).not.toHaveProperty('vscode');
    expect(allDeps).not.toHaveProperty('vscode-uri');

    // LSP標準パッケージは存在することを確認
    expect(allDeps['vscode-languageserver']).toBeDefined();
    expect(allDeps['vscode-languageserver-textdocument']).toBeDefined();
  });

  test('all packages should have correct configuration', async () => {
    const serverPackageJson = await Bun.file(
      join(__dirname, '..', 'packages', 'server', 'package.json')
    ).json();

    // サーバーはCJS形式でビルドされる（type: "module" は不要）
    expect(serverPackageJson.main).toBe('dist/server.js');
  });

  test('sample files should exist', async () => {
    const sampleFiles = ['samples/argo/workflow.yaml', 'packages/nvim-client/test.yaml'];

    for (const sampleFile of sampleFiles) {
      const filePath = join(__dirname, '..', sampleFile);
      const exists = await Bun.file(filePath).exists();
      expect(exists).toBe(true);
    }
  });
});
