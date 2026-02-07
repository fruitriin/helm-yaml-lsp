import { describe, expect, it } from 'bun:test';
import {
  extractAllSourcePaths,
  extractTemplatePath,
  parseHelmTemplateOutput,
} from '../../src/features/renderedYamlParser';

describe('renderedYamlParser', () => {
  describe('parseHelmTemplateOutput', () => {
    it('should parse single document output', () => {
      const output = `---
# Source: my-chart/templates/workflow.yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: my-workflow`;

      const docs = parseHelmTemplateOutput(output, 'my-chart');
      expect(docs).toHaveLength(1);
      expect(docs[0].sourceTemplatePath).toBe('templates/workflow.yaml');
      expect(docs[0].content).toContain('apiVersion: argoproj.io/v1alpha1');
      expect(docs[0].content).toContain('name: my-workflow');
    });

    it('should parse multiple document output', () => {
      const output = `---
# Source: my-chart/templates/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
---
# Source: my-chart/templates/workflow.yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: my-workflow`;

      const docs = parseHelmTemplateOutput(output, 'my-chart');
      expect(docs).toHaveLength(2);
      expect(docs[0].sourceTemplatePath).toBe('templates/configmap.yaml');
      expect(docs[0].content).toContain('kind: ConfigMap');
      expect(docs[1].sourceTemplatePath).toBe('templates/workflow.yaml');
      expect(docs[1].content).toContain('kind: Workflow');
    });

    it('should handle empty output', () => {
      const docs = parseHelmTemplateOutput('', 'my-chart');
      expect(docs).toHaveLength(0);
    });

    it('should handle whitespace-only output', () => {
      const docs = parseHelmTemplateOutput('  \n  \n', 'my-chart');
      expect(docs).toHaveLength(0);
    });

    it('should preserve comments in content', () => {
      const output = `---
# Source: my-chart/templates/workflow.yaml
# This is a comment
apiVersion: argoproj.io/v1alpha1
# Another comment
kind: Workflow`;

      const docs = parseHelmTemplateOutput(output, 'my-chart');
      expect(docs).toHaveLength(1);
      expect(docs[0].content).toContain('# This is a comment');
      expect(docs[0].content).toContain('# Another comment');
    });

    it('should track line numbers correctly', () => {
      const output = `---
# Source: my-chart/templates/first.yaml
line1
line2
---
# Source: my-chart/templates/second.yaml
line3
line4`;

      const docs = parseHelmTemplateOutput(output, 'my-chart');
      expect(docs).toHaveLength(2);
      // first.yaml: starts after "# Source:" line (line index 2), ends before "---" (line index 3)
      expect(docs[0].startLine).toBe(2);
      // second.yaml: starts after "# Source:" line (line index 6)
      expect(docs[1].startLine).toBe(6);
    });

    it('should handle documents from same template file', () => {
      const output = `---
# Source: my-chart/templates/multi.yaml
apiVersion: v1
kind: ConfigMap
---
# Source: my-chart/templates/multi.yaml
apiVersion: v1
kind: Secret`;

      const docs = parseHelmTemplateOutput(output, 'my-chart');
      expect(docs).toHaveLength(2);
      expect(docs[0].sourceTemplatePath).toBe('templates/multi.yaml');
      expect(docs[1].sourceTemplatePath).toBe('templates/multi.yaml');
      expect(docs[0].content).toContain('kind: ConfigMap');
      expect(docs[1].content).toContain('kind: Secret');
    });

    it('should handle nested templates directory', () => {
      const output = `---
# Source: my-chart/templates/sub/workflow.yaml
apiVersion: argoproj.io/v1alpha1`;

      const docs = parseHelmTemplateOutput(output, 'my-chart');
      expect(docs).toHaveLength(1);
      expect(docs[0].sourceTemplatePath).toBe('templates/sub/workflow.yaml');
    });

    it('should handle output with trailing newlines', () => {
      const output = `---
# Source: my-chart/templates/workflow.yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow

`;

      const docs = parseHelmTemplateOutput(output, 'my-chart');
      expect(docs).toHaveLength(1);
      expect(docs[0].content).toContain('kind: Workflow');
    });
  });

  describe('extractTemplatePath', () => {
    it('should extract path with chart name prefix', () => {
      expect(extractTemplatePath('my-chart/templates/workflow.yaml', 'my-chart')).toBe(
        'templates/workflow.yaml'
      );
    });

    it('should extract nested template path', () => {
      expect(extractTemplatePath('my-chart/templates/sub/workflow.yaml', 'my-chart')).toBe(
        'templates/sub/workflow.yaml'
      );
    });

    it('should handle templates-only path', () => {
      expect(extractTemplatePath('templates/workflow.yaml', 'my-chart')).toBe(
        'templates/workflow.yaml'
      );
    });

    it('should handle unknown chart name by falling back to templates/ detection', () => {
      expect(extractTemplatePath('other-chart/templates/workflow.yaml', 'my-chart')).toBe(
        'templates/workflow.yaml'
      );
    });

    it('should return null for non-template paths', () => {
      expect(extractTemplatePath('my-chart/values.yaml', 'my-chart')).toBeNull();
    });
  });

  describe('extractAllSourcePaths', () => {
    it('should extract all source paths', () => {
      const output = `---
# Source: my-chart/templates/configmap.yaml
apiVersion: v1
---
# Source: my-chart/templates/workflow.yaml
apiVersion: argoproj.io/v1alpha1`;

      const paths = extractAllSourcePaths(output);
      expect(paths).toEqual([
        'my-chart/templates/configmap.yaml',
        'my-chart/templates/workflow.yaml',
      ]);
    });

    it('should return empty array for output without source comments', () => {
      const output = 'apiVersion: v1\nkind: ConfigMap';
      const paths = extractAllSourcePaths(output);
      expect(paths).toEqual([]);
    });
  });
});
