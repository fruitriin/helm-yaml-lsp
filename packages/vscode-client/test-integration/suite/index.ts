import * as path from 'node:path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
	// Mochaテストランナーを作成
	const mocha = new Mocha({
		ui: 'tdd',
		color: true,
		timeout: 60000, // 60秒（LSPサーバーの起動とインデックス化を待つため）
	});

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise((resolve, reject) => {
		glob('**/**.test.js', { cwd: testsRoot }).then((files) => {
			// テストファイルをMochaに追加
			for (const f of files) {
				mocha.addFile(path.resolve(testsRoot, f));
			}

			try {
				// テストを実行
				mocha.run((failures) => {
					if (failures > 0) {
						reject(new Error(`${failures} tests failed.`));
					} else {
						resolve();
					}
				});
			} catch (err) {
				console.error(err);
				reject(err);
			}
		}).catch((err) => {
			reject(err);
		});
	});
}
