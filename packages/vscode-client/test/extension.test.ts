import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

describe('VSCode Client Extension', () => {
  test('should have extension.ts', async () => {
    const extensionPath = join(__dirname, '..', 'src', 'extension.ts');
    const extensionFile = Bun.file(extensionPath);

    expect(await extensionFile.exists()).toBe(true);
  });

  test('should have package.json with correct configuration', async () => {
    const packageJsonPath = join(__dirname, '..', 'package.json');
    const packageJson = await Bun.file(packageJsonPath).json();

    // 基本情報の確認
    expect(packageJson.name).toBe('helm-yaml-lsp-client');
    expect(packageJson.main).toContain('extension.js');

    // 依存関係の確認
    expect(packageJson.dependencies).toHaveProperty('vscode-languageclient');
  });

  test('should build successfully', async () => {
    const distPath = join(__dirname, '..', 'dist', 'extension.js');
    const distFile = Bun.file(distPath);

    expect(await distFile.exists()).toBe(true);

    // ビルド成果物のサイズチェック
    const size = await distFile.size;
    expect(size).toBeGreaterThan(10000); // 最低10KB以上
  });

  test('extension should reference server correctly', async () => {
    const extensionPath = join(__dirname, '..', 'src', 'extension.ts');
    const content = await Bun.file(extensionPath).text();

    // サーバーパスの参照を確認
    expect(content).toContain('server');
    expect(content).toContain('server.js');
    expect(content).toContain('LanguageClient');
  });

  test('should support YAML and Helm file types', async () => {
    const extensionPath = join(__dirname, '..', 'src', 'extension.ts');
    const content = await Bun.file(extensionPath).text();

    expect(content).toContain('yaml');
    expect(content).toContain('helm');
  });

  test('should have editor-independent server reference', async () => {
    const extensionPath = join(__dirname, '..', 'src', 'extension.ts');
    const content = await Bun.file(extensionPath).text();

    // サーバーへの参照が相対パスで正しく設定されている
    expect(content).toContain("'..', 'server'");
  });
});
