/**
 * Argo Workflows LSP - Completion Provider Test
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItemKind, Position } from 'vscode-languageserver-types';
import { CompletionProvider } from '../../src/providers/completionProvider';
import { ArgoTemplateIndex } from '../../src/services/argoTemplateIndex';

describe('CompletionProvider', () => {
  let provider: CompletionProvider;
  let templateIndex: ArgoTemplateIndex;
  let testDir: string;

  beforeEach(async () => {
    templateIndex = new ArgoTemplateIndex();
    provider = new CompletionProvider(templateIndex);
    testDir = path.join(tmpdir(), `lsp-test-completion-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    templateIndex.clear();
  });

  describe('provideCompletion', () => {
    it('should return empty for non-Argo documents', async () => {
      const doc = TextDocument.create(
        'file:///deployment.yaml',
        'yaml',
        1,
        'apiVersion: v1\nkind: Deployment\n'
      );
      const position = Position.create(0, 0);

      const completions = await provider.provideCompletion(doc, position);
      expect(completions.items.length).toBe(0);
    });

    it('should provide local template name completion', async () => {
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
            template:
    - name: hello
      container:
        image: alpine
    - name: world
      container:
        image: busybox
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);

      // "template: " の後の位置
      const position = Position.create(10, 23);

      const completions = await provider.provideCompletion(doc, position);
      expect(completions.items.length).toBeGreaterThan(0);

      // ローカルテンプレート名が含まれているか
      const labels = completions.items.map(item => item.label);
      expect(labels).toContain('main');
      expect(labels).toContain('hello');
      expect(labels).toContain('world');

      // CompletionItemKind.Function であることを確認
      for (const item of completions.items) {
        expect(item.kind).toBe(CompletionItemKind.Function);
      }
    });

    it('should provide workflow variable completion', async () => {
      const workflowContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: main
      container:
        image: alpine
        args: ["echo", "{{workflow."]
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);

      // "{{workflow." の後の位置
      const position = Position.create(10, 41);

      const completions = await provider.provideCompletion(doc, position);
      expect(completions.items.length).toBeGreaterThan(0);

      // Workflow変数が含まれているか
      const labels = completions.items.map(item => item.label);
      expect(labels).toContain('workflow.name');
      expect(labels).toContain('workflow.namespace');
      expect(labels).toContain('workflow.uid');

      // CompletionItemKind.Property であることを確認
      for (const item of completions.items) {
        expect(item.kind).toBe(CompletionItemKind.Property);
      }
    });

    it('should provide inputs.parameters completion', async () => {
      const workflowContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: main
      inputs:
        parameters:
          - name: message
            value: "Hello"
          - name: count
            value: "10"
      container:
        image: alpine
        args: ["echo", "{{inputs.parameters."]
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);

      // "{{inputs.parameters." の後の位置
      const position = Position.create(16, 49);

      const completions = await provider.provideCompletion(doc, position);
      expect(completions.items.length).toBeGreaterThan(0);

      // パラメータ名が含まれているか
      const labels = completions.items.map(item => item.label);
      expect(labels).toContain('message');
      expect(labels).toContain('count');

      // CompletionItemKind.Variable であることを確認
      for (const item of completions.items) {
        expect(item.kind).toBe(CompletionItemKind.Variable);
        expect(item.detail).toContain('Parameter');
      }
    });

    it('should provide outputs.parameters completion', async () => {
      const workflowContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: generate
      outputs:
        parameters:
          - name: result
            valueFrom:
              path: /tmp/result.txt
          - name: status
            valueFrom:
              path: /tmp/status.txt
      script:
        image: alpine
        source: |
          echo "test" > /tmp/result.txt
          echo {{outputs.parameters.
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);

      // "{{outputs.parameters." の後の位置
      const position = Position.create(20, 39);

      const completions = await provider.provideCompletion(doc, position);
      expect(completions.items.length).toBeGreaterThan(0);

      // パラメータ名が含まれているか
      const labels = completions.items.map(item => item.label);
      expect(labels).toContain('result');
      expect(labels).toContain('status');

      // CompletionItemKind.Variable であることを確認
      for (const item of completions.items) {
        expect(item.kind).toBe(CompletionItemKind.Variable);
        expect(item.detail).toContain('Parameter');
      }
    });

    it('should return empty for non-completion context', async () => {
      const workflowContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);

      // 補完コンテキストではない位置
      const position = Position.create(0, 0);

      const completions = await provider.provideCompletion(doc, position);
      expect(completions.items.length).toBe(0);
    });

    it('should provide completion with template comments', async () => {
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
            template:
    # Print hello message
    - name: hello  # Say hello
      container:
        image: alpine
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);

      // "template: " の後の位置
      const position = Position.create(10, 23);

      const completions = await provider.provideCompletion(doc, position);
      expect(completions.items.length).toBeGreaterThan(0);

      // "hello" テンプレートを探す
      const helloItem = completions.items.find(item => item.label === 'hello');
      expect(helloItem).toBeDefined();

      // ドキュメントにコメントが含まれているか
      if (helloItem?.documentation) {
        expect(helloItem.documentation).toContain('Print hello message');
      }
    });

    it('should provide completion with parameter default values', async () => {
      const workflowContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: main
      inputs:
        parameters:
          # Message to display
          - name: message
            value: "Hello World"
      container:
        image: alpine
        args: ["echo", "{{inputs.parameters."]
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);

      // "{{inputs.parameters." の後の位置
      const position = Position.create(15, 49);

      const completions = await provider.provideCompletion(doc, position);
      expect(completions.items.length).toBeGreaterThan(0);

      // "message" パラメータを探す
      const messageItem = completions.items.find(item => item.label === 'message');
      expect(messageItem).toBeDefined();

      // ドキュメントにデフォルト値とコメントが含まれているか
      if (messageItem?.documentation) {
        const doc = messageItem.documentation as string;
        expect(doc).toContain('Message to display');
        expect(doc).toContain('Default: Hello World');
      }
    });
  });
});
