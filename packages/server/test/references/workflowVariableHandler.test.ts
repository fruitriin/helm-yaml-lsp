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
});
