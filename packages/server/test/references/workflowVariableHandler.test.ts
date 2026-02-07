/**
 * workflowVariableHandler - definition jump tests
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import { createWorkflowVariableHandler } from '@/references/handlers/workflowVariableHandler';

function makeDoc(content: string, uri = 'file:///test.yaml') {
  return TextDocument.create(uri, 'yaml', 1, content);
}

describe('workflowVariableHandler', () => {
  const handler = createWorkflowVariableHandler();

  describe('workflow.name definition jump', () => {
    it('should jump to metadata.name', async () => {
      const doc = makeDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: my-workflow
spec:
  templates:
    - name: test
      container:
        args: ["{{workflow.name}}"]
`);
      // cursor on {{workflow.name}} at line 8
      const detected = handler.detect(doc, Position.create(8, 20));
      expect(detected).toBeDefined();

      const resolved = await handler.resolve(doc, detected!);
      expect(resolved.definitionLocation).not.toBeNull();
      expect(resolved.definitionLocation!.uri).toBe(doc.uri);
      // Should point to "my-workflow" in metadata.name line
      expect(resolved.definitionLocation!.range.start.line).toBe(3);
    });

    it('should jump to metadata.generateName when name is absent', async () => {
      const doc = makeDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: comprehensive-workflow-
spec:
  templates:
    - name: test
      container:
        args: ["{{workflow.name}}"]
`);
      const detected = handler.detect(doc, Position.create(8, 20));
      expect(detected).toBeDefined();

      const resolved = await handler.resolve(doc, detected!);
      expect(resolved.definitionLocation).not.toBeNull();
      expect(resolved.definitionLocation!.range.start.line).toBe(3);
    });
  });

  describe('workflow.namespace definition jump', () => {
    it('should jump to metadata.namespace', async () => {
      const doc = makeDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: my-workflow
  namespace: argo
spec:
  templates:
    - name: test
      container:
        args: ["{{workflow.namespace}}"]
`);
      const detected = handler.detect(doc, Position.create(9, 20));
      expect(detected).toBeDefined();

      const resolved = await handler.resolve(doc, detected!);
      expect(resolved.definitionLocation).not.toBeNull();
      expect(resolved.definitionLocation!.range.start.line).toBe(4);
    });

    it('should return null when metadata.namespace is absent', async () => {
      const doc = makeDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: my-workflow
spec:
  templates:
    - name: test
      container:
        args: ["{{workflow.namespace}}"]
`);
      const detected = handler.detect(doc, Position.create(8, 20));
      expect(detected).toBeDefined();

      const resolved = await handler.resolve(doc, detected!);
      expect(resolved.definitionLocation).toBeNull();
    });
  });

  describe('workflow.outputs.parameters definition jump', () => {
    it('should detect workflow.outputs.parameters.xxx', async () => {
      const doc = makeDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      container:
        args: ["{{workflow.outputs.parameters.final-result}}"]
`);
      const detected = handler.detect(doc, Position.create(6, 20));
      expect(detected).toBeDefined();
      expect(detected!.details.kind).toBe('workflowVariable');

      const details = detected!.details as { subPropertyType?: string; subProperty?: string };
      expect(details.subPropertyType).toBe('outputs.parameters');
      expect(details.subProperty).toBe('final-result');

      const resolved = await handler.resolve(doc, detected!);
      expect(resolved.hoverMarkdown).toContain('Workflow Output Parameter');
      expect(resolved.hoverMarkdown).toContain('final-result');
    });

    it('should jump to outputs.parameters definition', async () => {
      const doc = makeDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  outputs:
    parameters:
      - name: final-result
        valueFrom:
          parameter: "{{steps.last.outputs.parameters.result}}"
  templates:
    - name: test
      container:
        args: ["{{workflow.outputs.parameters.final-result}}"]
`);
      const detected = handler.detect(doc, Position.create(11, 20));
      expect(detected).toBeDefined();

      const resolved = await handler.resolve(doc, detected!);
      expect(resolved.definitionLocation).not.toBeNull();
      expect(resolved.definitionLocation!.range.start.line).toBe(5);
    });
  });

  describe('workflow.outputs.artifacts definition jump', () => {
    it('should detect workflow.outputs.artifacts.xxx', async () => {
      const doc = makeDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      container:
        args: ["{{workflow.outputs.artifacts.final-report}}"]
`);
      const detected = handler.detect(doc, Position.create(6, 20));
      expect(detected).toBeDefined();

      const details = detected!.details as { subPropertyType?: string; subProperty?: string };
      expect(details.subPropertyType).toBe('outputs.artifacts');
      expect(details.subProperty).toBe('final-report');

      const resolved = await handler.resolve(doc, detected!);
      expect(resolved.hoverMarkdown).toContain('Workflow Output Artifact');
      expect(resolved.hoverMarkdown).toContain('final-report');
    });

    it('should jump to outputs.artifacts definition', async () => {
      const doc = makeDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  outputs:
    artifacts:
      - name: final-report
        from: "{{steps.report.outputs.artifacts.report}}"
  templates:
    - name: test
      container:
        args: ["{{workflow.outputs.artifacts.final-report}}"]
`);
      const detected = handler.detect(doc, Position.create(10, 20));
      expect(detected).toBeDefined();

      const resolved = await handler.resolve(doc, detected!);
      expect(resolved.definitionLocation).not.toBeNull();
      expect(resolved.definitionLocation!.range.start.line).toBe(5);
    });
  });
});
