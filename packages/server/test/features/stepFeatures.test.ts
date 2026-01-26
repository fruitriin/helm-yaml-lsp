/**
 * Step/Task Features のテスト
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { findStepDefinitions, findTaskDefinitions } from '../../src/features/stepFeatures';

describe('stepFeatures', () => {
  describe('findStepDefinitions', () => {
    it('should find step definitions in steps section', () => {
      const content = `
apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - name: prepare-data
            template: prepare-data-template
        - - name: process-data
            template: process-data-template
`;
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const steps = findStepDefinitions(document);

      expect(steps.length).toBe(2);
      expect(steps[0].name).toBe('prepare-data');
      expect(steps[0].templateName).toBe('prepare-data-template');
      expect(steps[1].name).toBe('process-data');
      expect(steps[1].templateName).toBe('process-data-template');
    });

    it('should handle multiple steps on same level', () => {
      const content = `
spec:
  templates:
    - name: main
      steps:
        - - name: step-a
            template: template-a
          - name: step-b
            template: template-b
`;
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const steps = findStepDefinitions(document);

      expect(steps.length).toBe(2);
      expect(steps[0].name).toBe('step-a');
      expect(steps[1].name).toBe('step-b');
    });

    it('should not find steps outside steps section', () => {
      const content = `
spec:
  templates:
    - name: not-a-step
      container:
        name: my-container
        template: should-not-match
`;
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const steps = findStepDefinitions(document);

      expect(steps.length).toBe(0);
    });
  });

  describe('findTaskDefinitions', () => {
    it('should find task definitions in dag tasks section', () => {
      const content = `
spec:
  templates:
    - name: main
      dag:
        tasks:
          - name: task-a
            template: template-a
          - name: task-b
            template: template-b
            dependencies: [task-a]
`;
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const tasks = findTaskDefinitions(document);

      expect(tasks.length).toBe(2);
      expect(tasks[0].name).toBe('task-a');
      expect(tasks[0].templateName).toBe('template-a');
      expect(tasks[1].name).toBe('task-b');
      expect(tasks[1].templateName).toBe('template-b');
    });

    it('should not find tasks outside tasks section', () => {
      const content = `
spec:
  templates:
    - name: not-a-task
      container:
        name: my-container
`;
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const tasks = findTaskDefinitions(document);

      expect(tasks.length).toBe(0);
    });
  });
});
