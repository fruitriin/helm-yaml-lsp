/**
 * Template Features Tests
 *
 * Tests for findAllTemplateReferences including clusterScope detection
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import {
  findAllTemplateReferences,
  findTemplateReferenceAtPosition,
} from '@/features/templateFeatures';

describe('Template Features', () => {
  describe('findAllTemplateReferences', () => {
    it('should detect clusterScope: true when it appears after template: in templateRef block', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: main
      steps:
        - - name: step1
            templateRef:
              name: my-cluster-template
              template: my-task
              clusterScope: true
`;

      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const references = findAllTemplateReferences(document);

      expect(references).toHaveLength(1);
      expect(references[0].type).toBe('templateRef');
      expect(references[0].templateName).toBe('my-task');
      expect(references[0].workflowTemplateName).toBe('my-cluster-template');
      expect(references[0].clusterScope).toBe(true);
    });
  });

  describe('findTemplateReferenceAtPosition', () => {
    it('should NOT match {{inputs.parameters.xxx}} inside script/args block as templateRef', () => {
      // Bug: templateRef: block earlier in file causes false match on unrelated lines
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: main
      steps:
        - - name: step1
            templateRef:
              name: demo-templates
              template: process-data
            arguments:
              parameters:
              - name: data-source
                value: "db"
    - name: validate-step
      inputs:
        parameters:
        - name: record-count
          description: "処理されたレコード数"
      container:
        image: busybox:latest
        command: [sh, -c]
        args:
          - |
            COUNT={{inputs.parameters.record-count}}
            echo "Processed: $COUNT records"
`;

      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const lines = content.split('\n');
      // Find the line with {{inputs.parameters.record-count}}
      const targetLineIdx = lines.findIndex(l =>
        l.includes('COUNT={{inputs.parameters.record-count}}')
      );
      expect(targetLineIdx).toBeGreaterThan(0);

      // Cursor on the parameter reference - should NOT be detected as templateRef
      const pos = Position.create(targetLineIdx, 20);
      const ref = findTemplateReferenceAtPosition(document, pos);
      expect(ref).toBeUndefined();
    });

    it('should correctly detect templateRef when cursor is within the block', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: main
      steps:
        - - name: step1
            templateRef:
              name: demo-templates
              template: process-data
`;

      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const lines = content.split('\n');
      // Cursor on the "template: process-data" line
      const targetLineIdx = lines.findIndex(l => l.includes('template: process-data'));
      const pos = Position.create(targetLineIdx, 20);
      const ref = findTemplateReferenceAtPosition(document, pos);

      expect(ref).toBeDefined();
      expect(ref!.type).toBe('templateRef');
      expect(ref!.templateName).toBe('process-data');
      expect(ref!.workflowTemplateName).toBe('demo-templates');
    });
  });
});
