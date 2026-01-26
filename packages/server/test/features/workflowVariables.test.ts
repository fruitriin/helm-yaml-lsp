/**
 * Argo Workflows LSP - Workflow Variables Test
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import { findWorkflowVariableAtPosition } from '../../src/features/workflowVariables';

describe('workflowVariables', () => {
	describe('findWorkflowVariableAtPosition', () => {
		it('should find workflow.name reference', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      container:
        args: ["Workflow: {{workflow.name}}"]
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

			// "{{workflow.name}}" の位置
			const position = Position.create(6, 38);
			const result = findWorkflowVariableAtPosition(doc, position);

			expect(result).toBeDefined();
			expect(result?.variable.name).toBe('workflow.name');
			expect(result?.variable.description).toContain('Name of the Workflow');
		});

		it('should find workflow.namespace reference', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      container:
        env:
          - name: NAMESPACE
            value: "{{workflow.namespace}}"
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

			const position = Position.create(8, 35);
			const result = findWorkflowVariableAtPosition(doc, position);

			expect(result).toBeDefined();
			expect(result?.variable.name).toBe('workflow.namespace');
		});

		it('should find workflow.uid reference', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      script:
        source: echo {{workflow.uid}}
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

			const position = Position.create(6, 28);
			const result = findWorkflowVariableAtPosition(doc, position);

			expect(result).toBeDefined();
			expect(result?.variable.name).toBe('workflow.uid');
		});

		it('should find workflow.status reference', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      container:
        args: ["Status: {{workflow.status}}"]
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

			const position = Position.create(6, 40);
			const result = findWorkflowVariableAtPosition(doc, position);

			expect(result).toBeDefined();
			expect(result?.variable.name).toBe('workflow.status');
		});

		it('should return undefined for non-workflow-variable position', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
			const position = Position.create(0, 0);

			const result = findWorkflowVariableAtPosition(doc, position);
			expect(result).toBeUndefined();
		});

		it('should return undefined for unknown workflow variable', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      container:
        args: ["{{workflow.unknown}}"]
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
			const position = Position.create(6, 30);

			const result = findWorkflowVariableAtPosition(doc, position);
			expect(result).toBeUndefined();
		});

		it('should handle multiple workflow variables on same line', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      container:
        args: ["{{workflow.name}} in {{workflow.namespace}}"]
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

			// 最初の変数
			const position1 = Position.create(6, 25);
			const result1 = findWorkflowVariableAtPosition(doc, position1);
			expect(result1?.variable.name).toBe('workflow.name');

			// 2番目の変数
			const position2 = Position.create(6, 48);
			const result2 = findWorkflowVariableAtPosition(doc, position2);
			expect(result2?.variable.name).toBe('workflow.namespace');
		});
	});
});
