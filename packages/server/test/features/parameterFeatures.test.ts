/**
 * Argo Workflows LSP - Parameter Features Test
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import {
	findParameterDefinitions,
	findParameterReferenceAtPosition,
} from '../../src/features/parameterFeatures';

describe('parameterFeatures', () => {
	describe('findParameterDefinitions', () => {
		it('should find inputs.parameters definitions', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      inputs:
        parameters:
          # Message to print
          - name: message  # Default greeting
            value: "Hello World"
          - name: count
            value: "10"
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
			const definitions = findParameterDefinitions(doc);

			expect(definitions.length).toBe(2);

			const messageDef = definitions.find((d) => d.name === 'message');
			expect(messageDef).toBeDefined();
			expect(messageDef?.value).toBe('Hello World');
			expect(messageDef?.aboveComment).toBe('Message to print');
			expect(messageDef?.inlineComment).toBe('Default greeting');

			const countDef = definitions.find((d) => d.name === 'count');
			expect(countDef).toBeDefined();
			expect(countDef?.value).toBe('10');
		});

		it('should find outputs.parameters definitions', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      outputs:
        parameters:
          # Result value
          - name: result
            valueFrom:
              path: "/tmp/result.txt"
          - name: status
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
			const definitions = findParameterDefinitions(doc);

			expect(definitions.length).toBe(2);

			const resultDef = definitions.find((d) => d.name === 'result');
			expect(resultDef).toBeDefined();
			expect(resultDef?.aboveComment).toBe('Result value');

			const statusDef = definitions.find((d) => d.name === 'status');
			expect(statusDef).toBeDefined();
		});

		it('should handle parameters without values', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      inputs:
        parameters:
          - name: param1
          - name: param2
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
			const definitions = findParameterDefinitions(doc);

			expect(definitions.length).toBe(2);
			expect(definitions[0].value).toBeUndefined();
			expect(definitions[1].value).toBeUndefined();
		});

		it('should handle single-quoted values', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      inputs:
        parameters:
          - name: config
            value: 'default-config'
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
			const definitions = findParameterDefinitions(doc);

			expect(definitions.length).toBe(1);
			expect(definitions[0].value).toBe('default-config');
		});

		it('should handle unquoted values', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      inputs:
        parameters:
          - name: count
            value: 42
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
			const definitions = findParameterDefinitions(doc);

			expect(definitions.length).toBe(1);
			expect(definitions[0].value).toBe('42');
		});

		it('should find multiple parameters in multiple templates', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: template1
      inputs:
        parameters:
          - name: param1
            value: "value1"
    - name: template2
      inputs:
        parameters:
          - name: param2
            value: "value2"
      outputs:
        parameters:
          - name: result
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
			const definitions = findParameterDefinitions(doc);

			// デバッグ：実際に抽出されたパラメータ名を確認
			const names = definitions.map((d) => d.name);

			// template1, template2 の name は除外されるべき
			expect(definitions.length).toBe(3);
			expect(names).toContain('param1');
			expect(names).toContain('param2');
			expect(names).toContain('result');
			expect(names).not.toContain('template1');
			expect(names).not.toContain('template2');
		});
	});

	describe('findParameterReferenceAtPosition', () => {
		it('should find inputs.parameters reference', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      container:
        args: ["{{inputs.parameters.message}}"]
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

			// "message" の位置
			const position = Position.create(6, 40);
			const ref = findParameterReferenceAtPosition(doc, position);

			expect(ref).toBeDefined();
			expect(ref?.type).toBe('inputs.parameters');
			expect(ref?.parameterName).toBe('message');
		});

		it('should find outputs.parameters reference', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      script:
        source: |
          echo "{{outputs.parameters.result}}"
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

			// "result" の位置
			const position = Position.create(7, 30);
			const ref = findParameterReferenceAtPosition(doc, position);

			expect(ref).toBeDefined();
			expect(ref?.type).toBe('outputs.parameters');
			expect(ref?.parameterName).toBe('result');
		});

		it('should find steps.outputs.parameters reference', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: main
      steps:
        - - name: step1
            arguments:
              parameters:
                - name: data
                  value: "{{steps.generate.outputs.parameters.result}}"
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

			// "result" の位置
			const position = Position.create(10, 70);
			const ref = findParameterReferenceAtPosition(doc, position);

			expect(ref).toBeDefined();
			expect(ref?.type).toBe('steps.outputs.parameters');
			expect(ref?.parameterName).toBe('result');
			expect(ref?.stepOrTaskName).toBe('generate');
		});

		it('should find tasks.outputs.parameters reference', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: main
      dag:
        tasks:
          - name: task1
            arguments:
              parameters:
                - name: data
                  value: "{{tasks.producer.outputs.parameters.output}}"
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

			// "output" の位置
			const position = Position.create(11, 70);
			const ref = findParameterReferenceAtPosition(doc, position);

			expect(ref).toBeDefined();
			expect(ref?.type).toBe('tasks.outputs.parameters');
			expect(ref?.parameterName).toBe('output');
			expect(ref?.stepOrTaskName).toBe('producer');
		});

		it('should return undefined for non-parameter position', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
			const position = Position.create(0, 0);

			const ref = findParameterReferenceAtPosition(doc, position);
			expect(ref).toBeUndefined();
		});

		it('should handle multiple references on the same line', () => {
			const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      container:
        args: ["{{inputs.parameters.first}}", "{{inputs.parameters.second}}"]
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

			// 最初の参照
			const position1 = Position.create(6, 40);
			const ref1 = findParameterReferenceAtPosition(doc, position1);
			expect(ref1?.parameterName).toBe('first');

			// 2番目の参照
			const position2 = Position.create(6, 75);
			const ref2 = findParameterReferenceAtPosition(doc, position2);
			expect(ref2?.parameterName).toBe('second');
		});
	});
});
