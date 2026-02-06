/**
 * Debug test for findTemplateDefinitions
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { findTemplateDefinitions } from '@/features/templateFeatures';

describe('Template Debug', () => {
  it('should debug template detection', () => {
    const content = `---
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: demo-templates
spec:
  templates:
  - name: hello
    container:
      image: busybox
`;

    const lines = content.split('\n');
    console.log('\n=== Line-by-line analysis ===');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      console.log(`L${i + 1}: "${line}"`);

      // Check kind match
      const kindMatch = line.match(
        /^kind:\s*['"]?(ClusterWorkflowTemplate|WorkflowTemplate|CronWorkflow|Workflow)['"]?/
      );
      if (kindMatch) {
        console.log(`  → Kind matched: ${kindMatch[1]}`);
      }

      // Check name match
      const nameMatch = line.match(/^\s*name:\s*['"]?([\w-]+)['"]?\s*$/);
      if (nameMatch) {
        console.log(`  → Name matched: ${nameMatch[1]}`);
      }

      // Check templates match
      const templatesMatch = line.match(/^(\s*)templates:/);
      if (templatesMatch) {
        console.log(`  → templates: matched, indent=${templatesMatch[1].length}`);
      }

      // Check template name match
      const templateNameMatch = line.match(/^(\s*)-\s*name:\s*['"]?([\w-]+)['"]?/);
      if (templateNameMatch) {
        console.log(
          `  → Template name matched: ${templateNameMatch[2]}, indent=${templateNameMatch[1].length}`
        );
      }
    }

    const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
    const definitions = findTemplateDefinitions(document);

    console.log(`\n=== Found ${definitions.length} templates ===`);
    for (const def of definitions) {
      console.log(`  - ${def.name} (kind: ${def.kind}, workflow: ${def.workflowName})`);
    }

    expect(definitions.length).toBe(1);
  });
});
