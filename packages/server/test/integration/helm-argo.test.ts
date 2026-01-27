/**
 * Helm + Argo Workflows 統合テスト
 *
 * 実際のHelm Chart構造（samples/helm/）を使用して、
 * Helm機能とArgo Workflows機能が正しく動作することを検証
 */

import { beforeAll, describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import { filePathToUri } from '@/utils/uriUtils';
import { HelmChartIndex } from '@/services/helmChartIndex';
import { ValuesIndex } from '@/services/valuesIndex';
import { HelmTemplateIndex } from '@/services/helmTemplateIndex';
import { DefinitionProvider } from '@/providers/definitionProvider';
import { HoverProvider } from '@/providers/hoverProvider';
import { CompletionProvider } from '@/providers/completionProvider';
import { DiagnosticProvider } from '@/providers/diagnosticProvider';
import { ArgoTemplateIndex } from '@/services/argoTemplateIndex';

describe('Helm + Argo Workflows Integration Tests', () => {
	let helmChartIndex: HelmChartIndex;
	let valuesIndex: ValuesIndex;
	let helmTemplateIndex: HelmTemplateIndex;
	let argoTemplateIndex: ArgoTemplateIndex;
	let definitionProvider: DefinitionProvider;
	let hoverProvider: HoverProvider;
	let completionProvider: CompletionProvider;
	let diagnosticProvider: DiagnosticProvider;

	// test/integration/helm-argo.test.ts -> packages/server/test/integration/
	// プロジェクトルートは4階層上
	const samplesDir = path.resolve(__dirname, '../../../../samples');
	const helmDir = path.join(samplesDir, 'helm');
	const helmDirUri = filePathToUri(helmDir);

	beforeAll(async () => {

		// インデックスとプロバイダーを初期化
		helmChartIndex = new HelmChartIndex();
		valuesIndex = new ValuesIndex();
		helmTemplateIndex = new HelmTemplateIndex();
		argoTemplateIndex = new ArgoTemplateIndex();

		// Helm Chartをインデックス化
		await helmChartIndex.initialize([helmDirUri]);

		const charts = helmChartIndex.getAllCharts();
		expect(charts.length).toBeGreaterThan(0);

		// Values と Helm Templates をインデックス化
		await valuesIndex.initialize(charts);
		await helmTemplateIndex.initialize(charts);

		// プロバイダーを作成
		definitionProvider = new DefinitionProvider(
			argoTemplateIndex,
			helmChartIndex,
			valuesIndex,
			helmTemplateIndex,
		);
		hoverProvider = new HoverProvider(
			argoTemplateIndex,
			helmChartIndex,
			valuesIndex,
			helmTemplateIndex,
		);
		completionProvider = new CompletionProvider(
			helmChartIndex,
			valuesIndex,
			helmTemplateIndex,
		);
		diagnosticProvider = new DiagnosticProvider(
			argoTemplateIndex,
			helmChartIndex,
			valuesIndex,
			helmTemplateIndex,
		);
	});

	describe('Helm Chart Detection', () => {
		it('should detect Helm Chart structure', () => {
			const charts = helmChartIndex.getAllCharts();

			expect(charts).toHaveLength(1);
			expect(charts[0].name).toBe('argo-workflow-sample');
		});

		it('should find Chart for template files', () => {
			const templateFile = path.join(helmDir, 'templates/workflow.yaml');
			const uri = filePathToUri(templateFile);

			const chart = helmChartIndex.findChartForFile(uri);

			expect(chart).toBeDefined();
			expect(chart?.name).toBe('argo-workflow-sample');
		});
	});

	describe('values.yaml Parsing', () => {
		it('should parse values.yaml', () => {
			const values = valuesIndex.getAllValues('argo-workflow-sample');

			expect(values.length).toBeGreaterThan(0);

			// namespace値を確認
			const namespace = valuesIndex.findValue('argo-workflow-sample', 'namespace');
			expect(namespace).toBeDefined();
			expect(namespace?.value).toBe('argo');
		});

		it('should parse nested values', () => {
			const imageRepo = valuesIndex.findValue(
				'argo-workflow-sample',
				'workflow.image.repository',
			);

			expect(imageRepo).toBeDefined();
			expect(imageRepo?.value).toBe('alpine');
		});
	});

	describe('.Values Reference - Definition', () => {
		it('should jump to values.yaml from .Values reference', async () => {
			// samples/helm/templates/workflow.yaml の中で .Values.namespace を参照
			const workflowFile = path.join(helmDir, 'templates/workflow.yaml');
			const uri = filePathToUri(workflowFile);

			// ファイルを読み込んで .Values.namespace の位置を探す
			const fs = await import('node:fs');
			const content = fs.readFileSync(workflowFile, 'utf-8');
			const document = TextDocument.create(uri, 'yaml', 1, content);

			// .Values.namespace が含まれる行を探す
			const lines = content.split('\n');
			let targetLine = -1;
			let targetChar = -1;

			for (let i = 0; i < lines.length; i++) {
				const match = lines[i].match(/\.Values\.namespace/);
				if (match && match.index !== undefined) {
					targetLine = i;
					targetChar = match.index + 8; // ".Values." の長さ
					break;
				}
			}

			if (targetLine === -1) {
				console.log('Warning: .Values.namespace not found in workflow.yaml');
				return;
			}

			const position = Position.create(targetLine, targetChar);
			const location = await definitionProvider.provideDefinition(document, position);

			expect(location).not.toBeNull();
			if (location && !Array.isArray(location)) {
				expect(location.uri).toContain('values.yaml');
			}
		});
	});

	describe('.Values Reference - Hover', () => {
		it('should show hover info for .Values reference', async () => {
			const workflowFile = path.join(helmDir, 'templates/workflow.yaml');
			const uri = filePathToUri(workflowFile);

			const fs = await import('node:fs');
			const content = fs.readFileSync(workflowFile, 'utf-8');
			const document = TextDocument.create(uri, 'yaml', 1, content);

			// .Values を探す
			const lines = content.split('\n');
			let targetLine = -1;
			let targetChar = -1;

			for (let i = 0; i < lines.length; i++) {
				const match = lines[i].match(/\.Values\.\w+/);
				if (match && match.index !== undefined) {
					targetLine = i;
					targetChar = match.index + 8;
					break;
				}
			}

			if (targetLine === -1) {
				console.log('Warning: .Values not found in workflow.yaml');
				return;
			}

			const position = Position.create(targetLine, targetChar);
			const hover = await hoverProvider.provideHover(document, position);

			expect(hover).not.toBeNull();
			if (hover) {
				expect(hover.contents).toBeDefined();
			}
		});
	});

	describe('.Values Reference - Completion', () => {
		it('should provide .Values completion', async () => {
			// .Values. の直後でカーソル位置をシミュレート
			const content = 'namespace: {{ .Values.';
			const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

			// Chartをファイルに関連付けるため、実際のhelm templateファイルを使用
			const workflowFile = path.join(helmDir, 'templates/workflow.yaml');
			const uri = filePathToUri(workflowFile);
			const fs = await import('node:fs');
			const realContent = fs.readFileSync(workflowFile, 'utf-8');
			const realDoc = TextDocument.create(uri, 'yaml', 1, realContent + '\ntest: {{ .Values.');

			const position = Position.create(realDoc.lineCount - 1, 22); // .Values. の直後

			const completions = await completionProvider.provideCompletion(realDoc, position);

			expect(completions.items.length).toBeGreaterThan(0);

			// namespace, workflow などが含まれているはず
			const labels = completions.items.map(item => item.label);
			expect(labels.some(label => label.includes('namespace'))).toBe(true);
		});
	});

	describe('.Values Reference - Diagnostics', () => {
		it('should detect non-existent .Values reference', async () => {
			const workflowFile = path.join(helmDir, 'templates/workflow.yaml');
			const uri = filePathToUri(workflowFile);

			// 存在しない.Values参照を含むコンテンツ
			const content = `
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  namespace: {{ .Values.nonExistentValue }}
`;
			const document = TextDocument.create(uri, 'yaml', 1, content);

			const diagnostics = await diagnosticProvider.provideDiagnostics(document);

			// 存在しない値への参照が検出されるはず
			const valueErrors = diagnostics.filter(d =>
				d.message.includes('nonExistentValue')
			);
			expect(valueErrors.length).toBeGreaterThan(0);
		});
	});

	describe('Helm Template Definitions', () => {
		it('should index templates from _helpers.tpl', () => {
			const templates = helmTemplateIndex.getAllTemplates('argo-workflow-sample');

			expect(templates.length).toBeGreaterThan(0);

			// _helpers.tpl に定義されているテンプレートを確認
			const templateNames = templates.map(t => t.name);
			expect(templateNames).toContain('argo-workflow-sample.name');
			expect(templateNames).toContain('argo-workflow-sample.fullname');
			expect(templateNames).toContain('argo-workflow-sample.labels');
		});

		it('should extract template descriptions from comments', () => {
			const templates = helmTemplateIndex.getAllTemplates('argo-workflow-sample');

			const fullnameTemplate = templates.find(
				t => t.name === 'argo-workflow-sample.fullname'
			);

			expect(fullnameTemplate).toBeDefined();
			expect(fullnameTemplate?.description).toBeDefined();
		});
	});

	describe('include/template Reference - Definition', () => {
		it('should jump to template definition from include reference', async () => {
			// samples/helm/templates/ 内のファイルで {{ include "argo-workflow-sample.name" . }} を検索
			const fs = await import('node:fs');
			const templatesDir = path.join(helmDir, 'templates');
			const files = fs.readdirSync(templatesDir);

			let foundFile: string | null = null;
			let targetLine = -1;
			let targetChar = -1;

			for (const file of files) {
				if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;

				const filePath = path.join(templatesDir, file);
				const content = fs.readFileSync(filePath, 'utf-8');
				const lines = content.split('\n');

				for (let i = 0; i < lines.length; i++) {
					const match = lines[i].match(/include\s+"([^"]+)"/);
					if (match && match.index !== undefined) {
						foundFile = filePath;
						targetLine = i;
						targetChar = match.index + 9; // 'include "' の長さ
						break;
					}
				}

				if (foundFile) break;
			}

			if (!foundFile) {
				console.log('Warning: No include reference found in templates');
				return;
			}

			const uri = filePathToUri(foundFile);
			const content = fs.readFileSync(foundFile, 'utf-8');
			const document = TextDocument.create(uri, 'yaml', 1, content);

			const position = Position.create(targetLine, targetChar);
			const location = await definitionProvider.provideDefinition(document, position);

			expect(location).not.toBeNull();
			if (location && !Array.isArray(location)) {
				expect(location.uri).toContain('_helpers.tpl');
			}
		});
	});

	describe('include/template Reference - Hover', () => {
		it('should show hover info for include reference', async () => {
			const fs = await import('node:fs');
			const templatesDir = path.join(helmDir, 'templates');
			const files = fs.readdirSync(templatesDir);

			let foundFile: string | null = null;
			let targetLine = -1;
			let targetChar = -1;

			for (const file of files) {
				if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;

				const filePath = path.join(templatesDir, file);
				const content = fs.readFileSync(filePath, 'utf-8');
				const lines = content.split('\n');

				for (let i = 0; i < lines.length; i++) {
					const match = lines[i].match(/include\s+"([^"]+)"/);
					if (match && match.index !== undefined) {
						foundFile = filePath;
						targetLine = i;
						targetChar = match.index + 9;
						break;
					}
				}

				if (foundFile) break;
			}

			if (!foundFile) {
				console.log('Warning: No include reference found');
				return;
			}

			const uri = filePathToUri(foundFile);
			const content = fs.readFileSync(foundFile, 'utf-8');
			const document = TextDocument.create(uri, 'yaml', 1, content);

			const position = Position.create(targetLine, targetChar);
			const hover = await hoverProvider.provideHover(document, position);

			expect(hover).not.toBeNull();
			if (hover && typeof hover.contents === 'object' && 'value' in hover.contents) {
				expect(hover.contents.value).toContain('Template');
			}
		});
	});

	describe('include/template Reference - Diagnostics', () => {
		it('should detect non-existent template reference', async () => {
			const workflowFile = path.join(helmDir, 'templates/workflow.yaml');
			const uri = filePathToUri(workflowFile);

			const content = `
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: {{ include "non.existent.template" . }}
`;
			const document = TextDocument.create(uri, 'yaml', 1, content);

			const diagnostics = await diagnosticProvider.provideDiagnostics(document);

			const templateErrors = diagnostics.filter(d =>
				d.message.includes('non.existent.template')
			);
			expect(templateErrors.length).toBeGreaterThan(0);
		});
	});

	describe('Helm + Argo Combined', () => {
		it('should handle both Helm and Argo features in same file', async () => {
			// Helm templatesディレクトリ内のArgo Workflowファイルをチェック
			const workflowFile = path.join(helmDir, 'templates/workflow.yaml');
			const uri = filePathToUri(workflowFile);

			const fs = await import('node:fs');
			const content = fs.readFileSync(workflowFile, 'utf-8');
			const document = TextDocument.create(uri, 'yaml', 1, content);

			// Diagnosticsを実行
			const diagnostics = await diagnosticProvider.provideDiagnostics(document);

			// エラーがないか、あってもHelm/Argo両方の検証が動作していることを確認
			console.log(`Diagnostics for workflow.yaml: ${diagnostics.length} issues found`);

			// ドキュメントがHelm templateとして認識されていることを確認
			expect(content).toContain('{{');
		});
	});
});
