/**
 * Template Features - Multi-document YAML Test
 *
 * Tests that findTemplateDefinitions correctly handles
 * multiple YAML documents (separated by ---) in a single file
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { findTemplateDefinitions } from '@/features/templateFeatures';

describe('Template Features - Multi-document YAML', () => {
  it('should find templates in WorkflowTemplate after ConfigMap/Secret', () => {
    const content = `---
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  key: value

---
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
data:
  password: secret

---
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: demo-templates
  namespace: default
spec:
  templates:
  - name: process-data
    container:
      image: busybox

  - name: use-configmap
    container:
      image: busybox

  - name: use-secrets
    container:
      image: busybox

---
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: demo-workflow
spec:
  entrypoint: main
  templates:
  - name: main
    steps:
    - - name: step1
        templateRef:
          name: demo-templates
          template: process-data

  - name: local-template
    container:
      image: busybox
`;

    const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
    const definitions = findTemplateDefinitions(document);

    console.log('\nFound templates:');
    for (const def of definitions) {
      console.log(`  - ${def.name} (kind: ${def.kind}, workflow: ${def.workflowName})`);
    }

    // Should find 6 templates total:
    // 3 from WorkflowTemplate: process-data, use-configmap, use-secrets
    // 2 from Workflow: main, local-template
    expect(definitions.length).toBeGreaterThanOrEqual(5);

    // Check WorkflowTemplate templates
    const workflowTemplateTemplates = definitions.filter(
      d => d.kind === 'WorkflowTemplate' && d.workflowName === 'demo-templates'
    );
    expect(workflowTemplateTemplates.length).toBe(3);
    expect(workflowTemplateTemplates.map(t => t.name)).toEqual([
      'process-data',
      'use-configmap',
      'use-secrets',
    ]);

    // Check Workflow templates
    const workflowTemplates = definitions.filter(
      d => d.kind === 'Workflow' && d.workflowName === 'demo-workflow'
    );
    expect(workflowTemplates.length).toBe(2);
    expect(workflowTemplates.map(t => t.name)).toEqual(['main', 'local-template']);
  });

  it('should not confuse ConfigMap with WorkflowTemplate', () => {
    const content = `---
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  templates: "value"

---
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: my-templates
spec:
  templates:
  - name: hello
    container:
      image: busybox
`;

    const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
    const definitions = findTemplateDefinitions(document);

    // Should find only 1 template from WorkflowTemplate
    expect(definitions.length).toBe(1);
    expect(definitions[0].name).toBe('hello');
    expect(definitions[0].kind).toBe('WorkflowTemplate');
    expect(definitions[0].workflowName).toBe('my-templates');
  });
});
