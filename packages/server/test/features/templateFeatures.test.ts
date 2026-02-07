/**
 * Template Features Tests
 *
 * Tests for findAllTemplateReferences including clusterScope detection
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { findAllTemplateReferences } from '@/features/templateFeatures';

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
});
