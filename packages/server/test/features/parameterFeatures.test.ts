/**
 * Argo Workflows LSP - Parameter Features Test
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import {
  findAllParameterReferences,
  findArtifactDefinitions,
  findParameterDefinitions,
  findParameterReferenceAtPosition,
  findScriptDefinitionInTemplate,
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

      const messageDef = definitions.find(d => d.name === 'message');
      expect(messageDef).toBeDefined();
      expect(messageDef?.value).toBe('Hello World');
      expect(messageDef?.aboveComment).toBe('Message to print');
      expect(messageDef?.inlineComment).toBe('Default greeting');

      const countDef = definitions.find(d => d.name === 'count');
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

      const resultDef = definitions.find(d => d.name === 'result');
      expect(resultDef).toBeDefined();
      expect(resultDef?.aboveComment).toBe('Result value');

      const statusDef = definitions.find(d => d.name === 'status');
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
      const names = definitions.map(d => d.name);

      // template1, template2 の name は除外されるべき
      expect(definitions.length).toBe(3);
      expect(names).toContain('param1');
      expect(names).toContain('param2');
      expect(names).toContain('result');
      expect(names).not.toContain('template1');
      expect(names).not.toContain('template2');

      // templateName が正しく設定されているか確認
      const param1 = definitions.find(d => d.name === 'param1');
      expect(param1?.templateName).toBe('template1');

      const param2 = definitions.find(d => d.name === 'param2');
      expect(param2?.templateName).toBe('template2');

      const result = definitions.find(d => d.name === 'result');
      expect(result?.templateName).toBe('template2');
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

  describe('findAllParameterReferences', () => {
    it('should skip parameter references inside comment lines', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      # This comment has {{inputs.parameters.message}} which should be ignored
      container:
        image: alpine
        args: ["{{inputs.parameters.real-param}}"]
`;
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const refs = findAllParameterReferences(doc);

      const refNames = refs.map(r => r.parameterName);
      expect(refNames).toContain('real-param');
      expect(refNames).not.toContain('message');
      expect(refs.length).toBe(1);
    });

    it('should find all artifact references', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      container:
        args:
          - "{{inputs.artifacts.my-file}}"
          - "{{outputs.artifacts.result-file}}"
          - "{{steps.prepare.outputs.artifacts.data}}"
          - "{{tasks.build.outputs.artifacts.binary}}"
`;
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const refs = findAllParameterReferences(doc);

      expect(refs.length).toBe(4);
      expect(refs[0].type).toBe('inputs.artifacts');
      expect(refs[0].parameterName).toBe('my-file');
      expect(refs[1].type).toBe('outputs.artifacts');
      expect(refs[1].parameterName).toBe('result-file');
      expect(refs[2].type).toBe('steps.outputs.artifacts');
      expect(refs[2].parameterName).toBe('data');
      expect(refs[2].stepOrTaskName).toBe('prepare');
      expect(refs[3].type).toBe('tasks.outputs.artifacts');
      expect(refs[3].parameterName).toBe('binary');
      expect(refs[3].stepOrTaskName).toBe('build');
    });

    it('should skip artifact references in comments', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      # This comment has {{inputs.artifacts.my-file}} which should be ignored
      container:
        args: ["{{inputs.artifacts.real-artifact}}"]
`;
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const refs = findAllParameterReferences(doc);

      const refNames = refs.map(r => r.parameterName);
      expect(refNames).toContain('real-artifact');
      expect(refNames).not.toContain('my-file');
    });

    it('should find result references', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: main
      steps:
        - - name: run-script
            template: script-tmpl
            arguments:
              parameters:
                - name: data
                  value: "{{steps.run-script.outputs.result}}"
      dag:
        tasks:
          - name: compute
            template: compute-tmpl
            arguments:
              parameters:
                - name: data
                  value: "{{tasks.compute.outputs.result}}"
`;
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const refs = findAllParameterReferences(doc);

      const resultRefs = refs.filter(
        r => r.type === 'steps.outputs.result' || r.type === 'tasks.outputs.result'
      );
      expect(resultRefs.length).toBe(2);
      expect(resultRefs[0].type).toBe('steps.outputs.result');
      expect(resultRefs[0].parameterName).toBe('result');
      expect(resultRefs[0].stepOrTaskName).toBe('run-script');
      expect(resultRefs[1].type).toBe('tasks.outputs.result');
      expect(resultRefs[1].parameterName).toBe('result');
      expect(resultRefs[1].stepOrTaskName).toBe('compute');
    });
  });

  describe('findParameterReferenceAtPosition - artifacts', () => {
    it('should find inputs.artifacts reference', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      container:
        args: ["{{inputs.artifacts.my-file}}"]
`;
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(6, 30);
      const ref = findParameterReferenceAtPosition(doc, position);

      expect(ref).toBeDefined();
      expect(ref?.type).toBe('inputs.artifacts');
      expect(ref?.parameterName).toBe('my-file');
    });

    it('should find outputs.artifacts reference', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      container:
        args: ["{{outputs.artifacts.result-file}}"]
`;
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(6, 30);
      const ref = findParameterReferenceAtPosition(doc, position);

      expect(ref).toBeDefined();
      expect(ref?.type).toBe('outputs.artifacts');
      expect(ref?.parameterName).toBe('result-file');
    });

    it('should find steps.outputs.artifacts reference', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      container:
        args: ["{{steps.prepare.outputs.artifacts.data}}"]
`;
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(6, 30);
      const ref = findParameterReferenceAtPosition(doc, position);

      expect(ref).toBeDefined();
      expect(ref?.type).toBe('steps.outputs.artifacts');
      expect(ref?.parameterName).toBe('data');
      expect(ref?.stepOrTaskName).toBe('prepare');
    });

    it('should find tasks.outputs.artifacts reference', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      container:
        args: ["{{tasks.build.outputs.artifacts.binary}}"]
`;
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(6, 30);
      const ref = findParameterReferenceAtPosition(doc, position);

      expect(ref).toBeDefined();
      expect(ref?.type).toBe('tasks.outputs.artifacts');
      expect(ref?.parameterName).toBe('binary');
      expect(ref?.stepOrTaskName).toBe('build');
    });

    it('should find steps.outputs.result reference', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      container:
        args: ["{{steps.run-script.outputs.result}}"]
`;
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(6, 30);
      const ref = findParameterReferenceAtPosition(doc, position);

      expect(ref).toBeDefined();
      expect(ref?.type).toBe('steps.outputs.result');
      expect(ref?.parameterName).toBe('result');
      expect(ref?.stepOrTaskName).toBe('run-script');
    });

    it('should find tasks.outputs.result reference', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      container:
        args: ["{{tasks.compute.outputs.result}}"]
`;
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(6, 30);
      const ref = findParameterReferenceAtPosition(doc, position);

      expect(ref).toBeDefined();
      expect(ref?.type).toBe('tasks.outputs.result');
      expect(ref?.parameterName).toBe('result');
      expect(ref?.stepOrTaskName).toBe('compute');
    });
  });

  describe('findArtifactDefinitions', () => {
    it('should find input artifact definitions', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      inputs:
        artifacts:
          # Input data file
          - name: my-data
            path: /tmp/data.txt
`;
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const defs = findArtifactDefinitions(doc);

      expect(defs.length).toBe(1);
      expect(defs[0].name).toBe('my-data');
      expect(defs[0].path).toBe('/tmp/data.txt');
      expect(defs[0].aboveComment).toBe('Input data file');
    });

    it('should find output artifact definitions with path', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      outputs:
        artifacts:
          - name: result-file
            path: /tmp/result.txt
          - name: logs
            path: /var/log/output.log
`;
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const defs = findArtifactDefinitions(doc);

      expect(defs.length).toBe(2);
      expect(defs[0].name).toBe('result-file');
      expect(defs[0].path).toBe('/tmp/result.txt');
      expect(defs[1].name).toBe('logs');
      expect(defs[1].path).toBe('/var/log/output.log');
    });

    it('should find artifacts in multiple templates', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: template1
      inputs:
        artifacts:
          - name: input-data
            path: /tmp/input
      outputs:
        artifacts:
          - name: output-data
            path: /tmp/output
    - name: template2
      inputs:
        artifacts:
          - name: config
            path: /etc/config
`;
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const defs = findArtifactDefinitions(doc);

      expect(defs.length).toBe(3);
      const names = defs.map(d => d.name);
      expect(names).toContain('input-data');
      expect(names).toContain('output-data');
      expect(names).toContain('config');
    });
  });

  describe('findScriptDefinitionInTemplate', () => {
    it('should find script section with language from command', () => {
      const lines = [
        '    - name: my-script',
        '      script:',
        '        image: python:3.9',
        '        command: [python]',
        '        source: |',
        '          print("hello")',
      ];
      const result = findScriptDefinitionInTemplate(lines, { start: 0, end: 5 });

      expect(result).toBeDefined();
      expect(result?.scriptLine).toBe(1);
      expect(result?.language).toBe('python');
    });

    it('should find script section with language from image', () => {
      const lines = [
        '    - name: my-script',
        '      script:',
        '        image: bash:latest',
        '        source: |',
        '          echo "hello"',
      ];
      const result = findScriptDefinitionInTemplate(lines, { start: 0, end: 4 });

      expect(result).toBeDefined();
      expect(result?.scriptLine).toBe(1);
      expect(result?.language).toBe('bash');
    });

    it('should return undefined when no script section', () => {
      const lines = [
        '    - name: my-container',
        '      container:',
        '        image: alpine',
        '        command: [echo, hello]',
      ];
      const result = findScriptDefinitionInTemplate(lines, { start: 0, end: 3 });

      expect(result).toBeUndefined();
    });
  });
});
