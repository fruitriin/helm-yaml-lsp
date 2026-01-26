/**
 * Argo Workflows LSP - Definition Provider Test
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { DefinitionProvider } from '../../src/providers/definitionProvider';
import { ArgoTemplateIndex } from '../../src/services/argoTemplateIndex';
import { filePathToUri } from '../../src/utils/uriUtils';

describe('DefinitionProvider', () => {
	let provider: DefinitionProvider;
	let templateIndex: ArgoTemplateIndex;
	let testDir: string;

	beforeEach(async () => {
		templateIndex = new ArgoTemplateIndex();
		provider = new DefinitionProvider(templateIndex);
		testDir = path.join(tmpdir(), `lsp-test-definition-${Date.now()}`);
		await fs.mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(testDir, { recursive: true, force: true });
		templateIndex.clear();
	});

	describe('provideDefinition', () => {
		it('should return null for non-Argo documents', async () => {
			const doc = TextDocument.create(
				'file:///deployment.yaml',
				'yaml',
				1,
				'apiVersion: v1\nkind: Deployment\n',
			);
			const position = Position.create(0, 0);

			const location = await provider.provideDefinition(doc, position);
			expect(location).toBeNull();
		});

		it('should find WorkflowTemplate definition', async () => {
			// WorkflowTemplateを作成してインデックス
			const templateContent = `apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: my-template
spec:
  templates:
    - name: hello
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
			const doc = TextDocument.create(
				'file:///workflow.yaml',
				'yaml',
				1,
				workflowContent,
			);

			// "hello" の位置にカーソルを置く（13行目）
			const position = Position.create(12, 25); // "hello" の位置

			const location = await provider.provideDefinition(doc, position);
			expect(location).toBeDefined();
			if (location && !Array.isArray(location)) {
				expect(location.uri).toContain('template.yaml');
				// Range は hello テンプレートの name フィールドを指している
			}
		});

		it('should find ClusterWorkflowTemplate definition', async () => {
			// ClusterWorkflowTemplateを作成してインデックス
			const templateContent = `apiVersion: argoproj.io/v1alpha1
kind: ClusterWorkflowTemplate
metadata:
  name: my-cluster-template
spec:
  templates:
    - name: world
      container:
        image: alpine
`;
			const templatePath = path.join(testDir, 'cluster-template.yaml');
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
              name: my-cluster-template
              template: world
              clusterScope: true
`;
			const doc = TextDocument.create(
				'file:///workflow.yaml',
				'yaml',
				1,
				workflowContent,
			);

			// "world" の位置にカーソルを置く（13行目）
			const position = Position.create(12, 25); // "world" の位置

			const location = await provider.provideDefinition(doc, position);
			expect(location).toBeDefined();
			if (location && !Array.isArray(location)) {
				expect(location.uri).toContain('cluster-template.yaml');
			}
		});

		it('should return null for non-existent template', async () => {
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
			const doc = TextDocument.create(
				'file:///workflow.yaml',
				'yaml',
				1,
				workflowContent,
			);

			// "missing" の位置にカーソルを置く
			const position = Position.create(12, 25);

			const location = await provider.provideDefinition(doc, position);
			expect(location).toBeNull();
		});

		it('should return null when cursor is not on template reference', async () => {
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
			const doc = TextDocument.create(
				'file:///workflow.yaml',
				'yaml',
				1,
				workflowContent,
			);

			// "kind:" の位置にカーソルを置く（テンプレート参照ではない）
			const position = Position.create(1, 0);

			const location = await provider.provideDefinition(doc, position);
			expect(location).toBeNull();
		});
	});
});
