import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  extractChartNameFromSource,
  extractSourceTemplatePath,
  isRenderedYaml,
} from '../../src/features/renderedYamlDetection';

function createDoc(content: string, uri = 'file:///test.yaml'): TextDocument {
  return TextDocument.create(uri, 'yaml', 1, content);
}

describe('renderedYamlDetection', () => {
  describe('isRenderedYaml', () => {
    it('should return true for rendered YAML with # Source: comment and no template syntax', () => {
      const doc = createDoc(`---
# Source: my-chart/templates/workflow.yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: my-workflow`);
      expect(isRenderedYaml(doc)).toBe(true);
    });

    it('should return false for Helm templates containing {{ }} syntax', () => {
      const doc = createDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: {{ .Values.workflow.name }}
  labels:
    app: {{ .Chart.Name }}`);
      expect(isRenderedYaml(doc)).toBe(false);
    });

    it('should return false for Helm templates with {{- syntax', () => {
      const doc = createDoc(`apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ .Release.Name }}-config
{{- if .Values.enabled }}
  data:
    key: value
{{- end }}`);
      expect(isRenderedYaml(doc)).toBe(false);
    });

    it('should return false for plain YAML without # Source: comment', () => {
      const doc = createDoc(`apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  key: value`);
      expect(isRenderedYaml(doc)).toBe(false);
    });

    it('should return false for Helm template that also has # Source: comment', () => {
      const doc = createDoc(`---
# Source: my-chart/templates/workflow.yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: {{ .Values.workflow.name }}`);
      expect(isRenderedYaml(doc)).toBe(false);
    });

    it('should return true for rendered multi-document YAML', () => {
      const doc = createDoc(`---
# Source: my-chart/templates/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: rendered-config
data:
  key: rendered-value`);
      expect(isRenderedYaml(doc)).toBe(true);
    });

    it('should return false for empty document', () => {
      const doc = createDoc('');
      expect(isRenderedYaml(doc)).toBe(false);
    });

    it('should return true when # Source: is not at the very first line', () => {
      const doc = createDoc(`---
apiVersion: v1
# Source: my-chart/templates/service.yaml
kind: Service
metadata:
  name: my-service`);
      expect(isRenderedYaml(doc)).toBe(true);
    });

    it('should return false for YAML with curly braces in values but no Helm syntax', () => {
      // JSON-like values in YAML should not be detected as Helm syntax
      const doc = createDoc(`---
# Source: my-chart/templates/configmap.yaml
apiVersion: v1
kind: ConfigMap
data:
  config.json: '{"key": "value"}'`);
      expect(isRenderedYaml(doc)).toBe(true);
    });
  });

  describe('extractSourceTemplatePath', () => {
    it('should extract template path from # Source: comment', () => {
      const doc = createDoc(`---
# Source: my-chart/templates/workflow.yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow`);
      expect(extractSourceTemplatePath(doc)).toBe('templates/workflow.yaml');
    });

    it('should extract nested template path', () => {
      const doc = createDoc(`---
# Source: my-chart/templates/argo/workflow-basic.yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow`);
      expect(extractSourceTemplatePath(doc)).toBe('templates/argo/workflow-basic.yaml');
    });

    it('should return null when no # Source: comment exists', () => {
      const doc = createDoc(`apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config`);
      expect(extractSourceTemplatePath(doc)).toBeNull();
    });

    it('should return null when # Source: does not contain templates/ path', () => {
      const doc = createDoc(`---
# Source: my-chart/crds/custom-resource.yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition`);
      expect(extractSourceTemplatePath(doc)).toBeNull();
    });

    it('should extract path from first # Source: when multiple exist', () => {
      const doc = createDoc(`---
# Source: my-chart/templates/first.yaml
apiVersion: v1
kind: ConfigMap
---
# Source: my-chart/templates/second.yaml
apiVersion: v1
kind: Service`);
      expect(extractSourceTemplatePath(doc)).toBe('templates/first.yaml');
    });

    it('should handle chart names with hyphens', () => {
      const doc = createDoc(`---
# Source: my-complex-chart-name/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment`);
      expect(extractSourceTemplatePath(doc)).toBe('templates/deployment.yaml');
    });
  });

  describe('extractChartNameFromSource', () => {
    it('should extract chart name from # Source: comment', () => {
      const doc = createDoc(`---
# Source: my-chart/templates/workflow.yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow`);
      expect(extractChartNameFromSource(doc)).toBe('my-chart');
    });

    it('should return null when no # Source: comment exists', () => {
      const doc = createDoc(`apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config`);
      expect(extractChartNameFromSource(doc)).toBeNull();
    });

    it('should return null when # Source: has no /templates/ path', () => {
      const doc = createDoc(`---
# Source: crds/custom-resource.yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition`);
      expect(extractChartNameFromSource(doc)).toBeNull();
    });

    it('should extract chart name with hyphens', () => {
      const doc = createDoc(`---
# Source: argo-workflows-chart/templates/workflow.yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow`);
      expect(extractChartNameFromSource(doc)).toBe('argo-workflows-chart');
    });

    it('should handle subchart paths', () => {
      const doc = createDoc(`---
# Source: parent-chart/charts/sub-chart/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment`);
      // "parent-chart/charts/sub-chart" is before /templates/
      expect(extractChartNameFromSource(doc)).toBe('parent-chart/charts/sub-chart');
    });

    it('should return null for empty document', () => {
      const doc = createDoc('');
      expect(extractChartNameFromSource(doc)).toBeNull();
    });
  });
});
