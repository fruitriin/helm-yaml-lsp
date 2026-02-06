import * as assert from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';

/**
 * LSPサーバーが起動してインデックス化を完了するまで待機
 */
async function waitForLSPReady(timeoutMs = 30000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    // 少し待機
    await new Promise(resolve => setTimeout(resolve, 500));

    // ステータスバーやその他のインジケーターをチェックできますが、
    // ここでは単純に一定時間待機します
    if (Date.now() - startTime > 5000) {
      // 5秒待てば十分でしょう
      return;
    }
  }

  throw new Error('LSP server did not become ready in time');
}

/**
 * ファイルを開いてdiagnosticsが更新されるまで待機
 */
async function openFileAndWaitForDiagnostics(filePath: string): Promise<vscode.Uri> {
  const uri = vscode.Uri.file(filePath);
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);

  // diagnosticsが更新されるまで待機（最大10秒）
  const maxWait = 10000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 200));

    // diagnosticsが利用可能かチェック
    const diagnostics = vscode.languages.getDiagnostics(uri);
    if (diagnostics.length > 0 || Date.now() - startTime > 3000) {
      // diagnosticsが返ってくるか、3秒経過したら続行
      break;
    }
  }

  return uri;
}

suite('Diagnostics Integration Test', () => {
  const projectRoot = path.resolve(__dirname, '../../../../..');
  const samplesDir = path.join(projectRoot, 'samples');

  suiteSetup(async function () {
    this.timeout(60000); // 1分

    console.log('⏳ Waiting for LSP server to start and index files...');
    await waitForLSPReady();
    console.log('✅ LSP server is ready');
  });

  test('should have zero diagnostics for valid Argo workflow', async function () {
    this.timeout(30000); // 30秒

    const filePath = path.join(samplesDir, 'argo', 'demo-workflow-valid.yaml');
    console.log('📂 Opening file:', filePath);

    const uri = await openFileAndWaitForDiagnostics(filePath);

    // diagnosticsを取得
    const diagnostics = vscode.languages.getDiagnostics(uri);

    console.log(`📊 Diagnostics count: ${diagnostics.length}`);
    if (diagnostics.length > 0) {
      console.log('❌ Unexpected diagnostics:');
      for (const diag of diagnostics) {
        console.log(`  - Line ${diag.range.start.line + 1}: ${diag.message}`);
      }
    }

    // エラーがないことを確認
    assert.strictEqual(
      diagnostics.length,
      0,
      `Expected zero diagnostics, but found ${diagnostics.length}:\n${diagnostics.map(d => `  - ${d.message}`).join('\n')}`
    );
  });

  test('should detect errors in invalid Argo workflow', async function () {
    this.timeout(30000); // 30秒

    const filePath = path.join(samplesDir, 'argo', 'demo-workflow-invalid.yaml');
    console.log('📂 Opening file:', filePath);

    const uri = await openFileAndWaitForDiagnostics(filePath);

    // diagnosticsを取得
    const diagnostics = vscode.languages.getDiagnostics(uri);

    console.log(`📊 Diagnostics count: ${diagnostics.length}`);
    if (diagnostics.length > 0) {
      console.log('✅ Expected diagnostics found:');
      for (const diag of diagnostics) {
        console.log(`  - Line ${diag.range.start.line + 1}: ${diag.message}`);
      }
    }

    // エラーが検出されることを確認
    assert.ok(
      diagnostics.length > 0,
      'Expected to find errors in invalid workflow, but found none'
    );

    // 期待されるエラーメッセージが含まれているか確認
    const messages = diagnostics.map(d => d.message);
    const hasConfigMapError = messages.some(m => m.includes('missing-configmap'));
    const hasSecretError = messages.some(m => m.includes('missing-secret'));
    const hasTemplateError = messages.some(m => m.includes('non-existent-template'));

    assert.ok(hasConfigMapError, 'Expected to find ConfigMap error');
    assert.ok(hasSecretError, 'Expected to find Secret error');
    assert.ok(hasTemplateError, 'Expected to find Template error');
  });

  test('should have zero diagnostics for valid Helm workflow', async function () {
    this.timeout(30000); // 30秒

    const filePath = path.join(samplesDir, 'helm', 'templates', 'demo-workflow.yaml');
    console.log('📂 Opening file:', filePath);

    const uri = await openFileAndWaitForDiagnostics(filePath);

    // diagnosticsを取得
    const diagnostics = vscode.languages.getDiagnostics(uri);

    console.log(`📊 Diagnostics count: ${diagnostics.length}`);
    if (diagnostics.length > 0) {
      console.log('❌ Unexpected diagnostics:');
      for (const diag of diagnostics) {
        console.log(`  - Line ${diag.range.start.line + 1}: ${diag.message}`);
      }
    }

    // エラーがないことを確認
    assert.strictEqual(
      diagnostics.length,
      0,
      `Expected zero diagnostics, but found ${diagnostics.length}:\n${diagnostics.map(d => `  - ${d.message}`).join('\n')}`
    );
  });
});
