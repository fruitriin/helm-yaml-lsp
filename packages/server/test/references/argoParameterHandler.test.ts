/**
 * argoParameterHandler - artifact and result resolution tests
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import { createArgoParameterHandler } from '../../src/references/handlers/argoParameterHandler';

function makeDoc(content: string, uri = 'file:///test.yaml') {
  return TextDocument.create(uri, 'yaml', 1, content);
}

describe('argoParameterHandler', () => {
  const handler = createArgoParameterHandler();

  describe('artifact resolution', () => {
    it('should resolve input artifact reference', async () => {
      const doc = makeDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      inputs:
        artifacts:
          # Input data file
          - name: my-data
            path: /tmp/data.txt
      container:
        args: ["{{inputs.artifacts.my-data}}"]
`);
      const detected = handler.detect(doc, Position.create(11, 30));
      expect(detected).toBeDefined();
      expect(detected!.details.kind).toBe('argoParameter');

      const resolved = await handler.resolve(doc, detected!);
      expect(resolved.exists).toBe(true);
      expect(resolved.hoverMarkdown).toContain('Input Artifact');
      expect(resolved.hoverMarkdown).toContain('my-data');
      expect(resolved.hoverMarkdown).toContain('/tmp/data.txt');
      expect(resolved.definitionLocation).not.toBeNull();
      expect(resolved.definitionLocation!.range.start.line).toBe(8);
    });

    it('should resolve output artifact reference', async () => {
      const doc = makeDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      outputs:
        artifacts:
          - name: result-file
            path: /tmp/result.txt
      container:
        args: ["{{outputs.artifacts.result-file}}"]
`);
      const detected = handler.detect(doc, Position.create(10, 30));
      expect(detected).toBeDefined();

      const resolved = await handler.resolve(doc, detected!);
      expect(resolved.exists).toBe(true);
      expect(resolved.hoverMarkdown).toContain('Output Artifact');
      expect(resolved.hoverMarkdown).toContain('result-file');
      expect(resolved.hoverMarkdown).toContain('/tmp/result.txt');
    });

    it('should resolve step output artifact reference', async () => {
      const doc = makeDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: main
      steps:
        - - name: prepare
            template: prepare-data
        - - name: process
            template: process-data
            arguments:
              artifacts:
                - name: input
                  from: "{{steps.prepare.outputs.artifacts.output-file}}"
    - name: prepare-data
      outputs:
        artifacts:
          - name: output-file
            path: /tmp/output.txt
      container:
        image: alpine
`);
      const detected = handler.detect(doc, Position.create(13, 40));
      expect(detected).toBeDefined();

      const resolved = await handler.resolve(doc, detected!);
      expect(resolved.exists).toBe(true);
      expect(resolved.hoverMarkdown).toContain('Step Output Artifact');
      expect(resolved.hoverMarkdown).toContain('prepare');
      expect(resolved.hoverMarkdown).toContain('prepare-data');
    });

    it('should resolve task output artifact reference', async () => {
      const doc = makeDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: main
      dag:
        tasks:
          - name: build
            template: build-tmpl
          - name: deploy
            template: deploy-tmpl
            arguments:
              artifacts:
                - name: binary
                  from: "{{tasks.build.outputs.artifacts.build-output}}"
    - name: build-tmpl
      outputs:
        artifacts:
          - name: build-output
            path: /workspace/output
      container:
        image: golang
`);
      const detected = handler.detect(doc, Position.create(14, 40));
      expect(detected).toBeDefined();

      const resolved = await handler.resolve(doc, detected!);
      expect(resolved.exists).toBe(true);
      expect(resolved.hoverMarkdown).toContain('Task Output Artifact');
      expect(resolved.hoverMarkdown).toContain('build');
      expect(resolved.hoverMarkdown).toContain('build-tmpl');
    });

    it('should return not-found for unknown artifact', async () => {
      const doc = makeDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      inputs:
        artifacts:
          - name: existing
            path: /tmp/data.txt
      container:
        args: ["{{inputs.artifacts.non-existent}}"]
`);
      const detected = handler.detect(doc, Position.create(10, 30));
      expect(detected).toBeDefined();

      const resolved = await handler.resolve(doc, detected!);
      expect(resolved.exists).toBe(false);
      expect(resolved.diagnosticMessage).toContain('non-existent');
      expect(resolved.diagnosticMessage).toContain('not found');
    });

    it('should provide artifact completion', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: test
      inputs:
        artifacts:
          - name: my-data
            path: /tmp/data.txt
          - name: config-file
            path: /etc/config
      container:
        args: ["{{inputs.artifacts."]
`;
      const doc = makeDoc(content);
      // Find the line with {{inputs.artifacts.
      const lines = content.split('\n');
      const targetLine = lines.findIndex(l => l.includes('{{inputs.artifacts.'));
      const charPos =
        lines[targetLine].indexOf('{{inputs.artifacts.') + '{{inputs.artifacts.'.length;
      const items = handler.complete(doc, Position.create(targetLine, charPos));
      expect(items).toBeDefined();
      expect(items!.length).toBe(2);
      const labels = items!.map(i => i.label);
      expect(labels).toContain('my-data');
      expect(labels).toContain('config-file');
    });
  });

  describe('result resolution', () => {
    it('should resolve step output result', async () => {
      const doc = makeDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: main
      steps:
        - - name: run-script
            template: my-script
        - - name: use-result
            template: use-tmpl
            arguments:
              parameters:
                - name: data
                  value: "{{steps.run-script.outputs.result}}"
    - name: my-script
      script:
        image: python:3.9
        command: [python]
        source: |
          print("hello world")
`);
      const detected = handler.detect(doc, Position.create(13, 30));
      expect(detected).toBeDefined();

      const resolved = await handler.resolve(doc, detected!);
      expect(resolved.hoverMarkdown).toContain('Script Result');
      expect(resolved.hoverMarkdown).toContain('run-script');
      expect(resolved.hoverMarkdown).toContain('my-script');
      expect(resolved.hoverMarkdown).toContain('python');
      expect(resolved.hoverMarkdown).toContain('last line of stdout');
      expect(resolved.definitionLocation).not.toBeNull();
    });

    it('should resolve task output result', async () => {
      const doc = makeDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: main
      dag:
        tasks:
          - name: compute
            template: compute-tmpl
          - name: use-result
            template: use-tmpl
            arguments:
              parameters:
                - name: data
                  value: "{{tasks.compute.outputs.result}}"
    - name: compute-tmpl
      script:
        image: bash:latest
        command: [bash]
        source: |
          echo "42"
`);
      const detected = handler.detect(doc, Position.create(14, 30));
      expect(detected).toBeDefined();

      const resolved = await handler.resolve(doc, detected!);
      expect(resolved.hoverMarkdown).toContain('Script Result');
      expect(resolved.hoverMarkdown).toContain('compute');
      expect(resolved.hoverMarkdown).toContain('compute-tmpl');
      expect(resolved.hoverMarkdown).toContain('bash');
    });

    it('should return null definition for result when no script template', async () => {
      const doc = makeDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: main
      steps:
        - - name: run-step
            template: container-tmpl
        - - name: use-result
            template: use-tmpl
            arguments:
              parameters:
                - name: data
                  value: "{{steps.run-step.outputs.result}}"
    - name: container-tmpl
      container:
        image: alpine
        command: [echo, hello]
`);
      const detected = handler.detect(doc, Position.create(13, 30));
      expect(detected).toBeDefined();

      const resolved = await handler.resolve(doc, detected!);
      // Even without script, still get hover info
      expect(resolved.hoverMarkdown).toContain('Script Result');
      // But no definition location since there's no script section
      expect(resolved.definitionLocation).toBeNull();
    });
  });
});
