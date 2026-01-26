/**
 * Argo Workflows LSP - Hover Provider Test
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { MarkupKind, Position } from 'vscode-languageserver-types';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { HoverProvider } from '../../src/providers/hoverProvider';
import { ArgoTemplateIndex } from '../../src/services/argoTemplateIndex';
import { filePathToUri } from '../../src/utils/uriUtils';

describe('HoverProvider', () => {
	let provider: HoverProvider;
	let templateIndex: ArgoTemplateIndex;
	let testDir: string;

	beforeEach(async () => {
		templateIndex = new ArgoTemplateIndex();
		provider = new HoverProvider(templateIndex);
		testDir = path.join(tmpdir(), `lsp-test-hover-${Date.now()}`);
		await fs.mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(testDir, { recursive: true, force: true });
		templateIndex.clear();
	});

	describe('provideHover', () => {
		it('should return null for non-Argo documents', async () => {
			const doc = TextDocument.create(
				'file:///deployment.yaml',
				'yaml',
				1,
				'apiVersion: v1\nkind: Deployment\n',
			);
			const position = Position.create(0, 0);

			const hover = await provider.provideHover(doc, position);
			expect(hover).toBeNull();
		});

		it('should return null when no template reference at position', async () => {
			const workflowContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
`;
			const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);
			const position = Position.create(0, 0);

			const hover = await provider.provideHover(doc, position);
			expect(hover).toBeNull();
		});

		it('should provide hover for WorkflowTemplate reference', async () => {
			// WorkflowTemplateを作成してインデックス
			const templateContent = `apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: my-template
spec:
  templates:
    # Print a greeting message
    - name: hello  # Say hello
      container:
        image: alpine
`;
			const templatePath = path.join(testDir, 'template.yaml');
			await fs.writeFile(templatePath, templateContent);
			await templateIndex.indexFile(filePathToUri(templatePath));

			// WorkflowでtemplateRefを参照
			const workflowContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - name: step1
            templateRef:
              name: my-template
              template: hello
`;
			const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);

			// "template: hello" の位置
			const position = Position.create(11, 25);

			const hover = await provider.provideHover(doc, position);
			expect(hover).not.toBeNull();
			expect(hover?.contents).toBeDefined();

			if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
				expect(hover.contents.kind).toBe(MarkupKind.Markdown);
				const markdown = hover.contents.value;

				// テンプレート名が含まれているか
				expect(markdown).toContain('**Template**: `hello`');
				// WorkflowTemplate名が含まれているか
				expect(markdown).toContain('**WorkflowTemplate**: `my-template`');
				// コメントが含まれているか
				expect(markdown).toContain('Print a greeting message');
				expect(markdown).toContain('Say hello');
			}
		});

		it('should provide hover for ClusterWorkflowTemplate reference', async () => {
			// ClusterWorkflowTemplateを作成してインデックス
			const templateContent = `apiVersion: argoproj.io/v1alpha1
kind: ClusterWorkflowTemplate
metadata:
  name: cluster-template
spec:
  templates:
    # Cluster-wide template
    - name: shared-task
      container:
        image: busybox
`;
			const templatePath = path.join(testDir, 'cluster-template.yaml');
			await fs.writeFile(templatePath, templateContent);
			await templateIndex.indexFile(filePathToUri(templatePath));

			// WorkflowでClusterWorkflowTemplateを参照
			const workflowContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - name: step1
            templateRef:
              name: cluster-template
              template: shared-task
              clusterScope: true
`;
			const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);

			// "name: cluster-template" の位置（templateRefブロック内ならどこでも動作）
			const position = Position.create(11, 25);

			const hover = await provider.provideHover(doc, position);
			expect(hover).not.toBeNull();

			if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
				const markdown = hover.contents.value;
				expect(markdown).toContain('**Template**: `shared-task`');
				expect(markdown).toContain('**ClusterWorkflowTemplate**: `cluster-template`');
				expect(markdown).toContain('Cluster-wide template');
			}
		});

		it('should handle templates without comments', async () => {
			const templateContent = `apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: simple-template
spec:
  templates:
    - name: no-comment
      container:
        image: alpine
`;
			const templatePath = path.join(testDir, 'simple.yaml');
			await fs.writeFile(templatePath, templateContent);
			await templateIndex.indexFile(filePathToUri(templatePath));

			const workflowContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - name: step1
            templateRef:
              name: simple-template
              template: no-comment
`;
			const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);
			const position = Position.create(11, 25);

			const hover = await provider.provideHover(doc, position);
			expect(hover).not.toBeNull();

			if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
				const markdown = hover.contents.value;
				expect(markdown).toContain('**Template**: `no-comment`');
				expect(markdown).toContain('**WorkflowTemplate**: `simple-template`');
				// コメントがないことを確認（基本情報のみ）
				expect(markdown.split('\n').length).toBeLessThanOrEqual(2);
			}
		});

		it('should return null for template reference not found in index', async () => {
			const workflowContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - name: step1
            templateRef:
              name: non-existent
              template: missing
`;
			const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);
			const position = Position.create(12, 25);

			const hover = await provider.provideHover(doc, position);
			expect(hover).toBeNull();
		});

		it('should return null for direct template reference (phase 3.6)', async () => {
			// 直接参照は Phase 3.6 で実装予定
			const workflowContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - name: step1
            template: local-template
    - name: local-template
      container:
        image: alpine
`;
			const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);
			const position = Position.create(10, 25);

			const hover = await provider.provideHover(doc, position);
			expect(hover).toBeNull();
		});

		it('should handle multiple comments correctly', async () => {
			const templateContent = `apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: multi-comment-template
spec:
  templates:
    # This is line 1 of the comment
    # This is line 2 of the comment
    # This is line 3 of the comment
    - name: multi-comment  # Inline comment here
      container:
        image: alpine
`;
			const templatePath = path.join(testDir, 'multi.yaml');
			await fs.writeFile(templatePath, templateContent);
			await templateIndex.indexFile(filePathToUri(templatePath));

			const workflowContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - name: step1
            templateRef:
              name: multi-comment-template
              template: multi-comment
`;
			const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);
			const position = Position.create(11, 25);

			const hover = await provider.provideHover(doc, position);
			expect(hover).not.toBeNull();

			if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
				const markdown = hover.contents.value;
				expect(markdown).toContain('This is line 1 of the comment');
				expect(markdown).toContain('This is line 2 of the comment');
				expect(markdown).toContain('This is line 3 of the comment');
				expect(markdown).toContain('Inline comment here');
			}
		});
	});
});
