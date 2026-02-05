import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main() {
	try {
		// プロジェクトルート
		const projectRoot = path.resolve(__dirname, '../../../');

		// 拡張機能のパス（test-integration/out から vscode-client へ）
		const extensionDevelopmentPath = path.resolve(__dirname, '../..');

		// テストスイートのパス
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		// ワークスペースパス（サンプルファイルを含む）
		const workspacePath = path.join(projectRoot, 'samples');

		console.log('🧪 Starting VSCode integration tests...');
		console.log('📂 Extension path:', extensionDevelopmentPath);
		console.log('📂 Test suite path:', extensionTestsPath);
		console.log('📂 Workspace path:', workspacePath);

		// VSCodeをダウンロードして拡張機能をロードし、テストを実行
		const exitCode = await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [
				workspacePath,
				'--disable-extensions', // 他の拡張機能を無効化（テストの独立性）
			],
		});

		process.exit(exitCode);
	} catch (err) {
		console.error('❌ Failed to run tests:', err);
		process.exit(1);
	}
}

main();
