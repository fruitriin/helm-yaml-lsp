/**
 * Argo Workflows LSP - Diagnostic Provider Test
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver-types';
import { DiagnosticProvider } from '../../src/providers/diagnosticProvider';
import { ArgoTemplateIndex } from '../../src/services/argoTemplateIndex';
import { filePathToUri } from '../../src/utils/uriUtils';

describe('DiagnosticProvider', () => {
  let provider: DiagnosticProvider;
  let templateIndex: ArgoTemplateIndex;
  let testDir: string;

  beforeEach(async () => {
    templateIndex = new ArgoTemplateIndex();
    provider = new DiagnosticProvider(templateIndex);
    testDir = path.join(tmpdir(), `lsp-test-diagnostic-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    templateIndex.clear();
  });

  describe('provideDiagnostics', () => {
    it('should return empty diagnostics for non-Argo documents', async () => {
      const doc = TextDocument.create(
        'file:///deployment.yaml',
        'yaml',
        1,
        'apiVersion: v1\nkind: Deployment\n'
      );

      const diagnostics = await provider.provideDiagnostics(doc);
      expect(diagnostics.length).toBe(0);
    });

    it('should detect non-existent local template reference', async () => {
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
            template: non-existent
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);

      const diagnostics = await provider.provideDiagnostics(doc);
      expect(diagnostics.length).toBeGreaterThan(0);

      const error = diagnostics.find(d => d.message.includes('non-existent'));
      expect(error).toBeDefined();
      expect(error?.severity).toBe(DiagnosticSeverity.Error);
      expect(error?.message).toContain("Template 'non-existent' not found");
    });

    it('should not report error for existing local template', async () => {
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
            template: hello
    - name: hello
      container:
        image: alpine
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);

      const diagnostics = await provider.provideDiagnostics(doc);
      expect(diagnostics.length).toBe(0);
    });

    it('should detect non-existent WorkflowTemplate reference', async () => {
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
              name: non-existent-template
              template: hello
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);

      const diagnostics = await provider.provideDiagnostics(doc);
      expect(diagnostics.length).toBeGreaterThan(0);

      const error = diagnostics.find(d => d.message.includes('non-existent-template'));
      expect(error).toBeDefined();
      expect(error?.severity).toBe(DiagnosticSeverity.Error);
      expect(error?.message).toContain(
        "Template 'hello' not found in WorkflowTemplate 'non-existent-template'"
      );
    });

    it('should not report error for existing WorkflowTemplate', async () => {
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

      const diagnostics = await provider.provideDiagnostics(doc);
      expect(diagnostics.length).toBe(0);
    });

    it('should detect non-existent input parameter reference', async () => {
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
        args: ["echo", "{{inputs.parameters.non-existent}}"]
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);

      const diagnostics = await provider.provideDiagnostics(doc);
      expect(diagnostics.length).toBeGreaterThan(0);

      const error = diagnostics.find(d => d.message.includes('non-existent'));
      expect(error).toBeDefined();
      expect(error?.severity).toBe(DiagnosticSeverity.Error);
      expect(error?.message).toContain("Parameter 'non-existent' not found in input parameters");
    });

    it('should not report error for existing input parameter', async () => {
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
      container:
        image: alpine
        args: ["echo", "{{inputs.parameters.message}}"]
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);

      const diagnostics = await provider.provideDiagnostics(doc);
      expect(diagnostics.length).toBe(0);
    });

    it('should detect non-existent output parameter reference', async () => {
      const workflowContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: generate
      script:
        image: alpine
        source: echo {{outputs.parameters.non-existent}}
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);

      const diagnostics = await provider.provideDiagnostics(doc);
      expect(diagnostics.length).toBeGreaterThan(0);

      const error = diagnostics.find(d => d.message.includes('non-existent'));
      expect(error).toBeDefined();
      expect(error?.severity).toBe(DiagnosticSeverity.Error);
      expect(error?.message).toContain("Parameter 'non-existent' not found in output parameters");
    });

    it('should not report error for existing output parameter', async () => {
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
      script:
        image: alpine
        source: echo {{outputs.parameters.result}}
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);

      const diagnostics = await provider.provideDiagnostics(doc);
      expect(diagnostics.length).toBe(0);
    });

    it('should detect multiple errors', async () => {
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
            template: non-existent-1
        - - name: step2
            template: non-existent-2
      container:
        image: alpine
        args: ["echo", "{{inputs.parameters.missing}}"]
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, workflowContent);

      const diagnostics = await provider.provideDiagnostics(doc);
      expect(diagnostics.length).toBe(3); // 2 template errors + 1 parameter error

      expect(diagnostics[0].message).toContain('non-existent-1');
      expect(diagnostics[1].message).toContain('non-existent-2');
      expect(diagnostics[2].message).toContain('missing');
    });
  });
});
