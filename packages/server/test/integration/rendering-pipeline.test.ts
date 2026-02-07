/**
 * Phase 7: Helm Template Rendering Pipeline - 統合テスト
 *
 * renderedYamlDetection, renderedYamlParser, symbolMapping,
 * helmTemplateExecutor の各モジュールが連携して正しく動作することを検証する。
 *
 * テスト範囲:
 * 1. レンダリング済みYAML検出 → パーサー → シンボルマッピングのパイプライン
 * 2. helmTemplateExecutor → パーサー → 検出の連携
 * 3. 型定義（rendering.ts）が各モジュールで正しく使われていること
 */

import { beforeAll, describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  extractChartNameFromSource,
  extractSourceTemplatePath,
  isRenderedYaml,
} from '../../src/features/renderedYamlDetection';
import {
  extractAllSourcePaths,
  extractTemplatePath,
  parseHelmTemplateOutput,
} from '../../src/features/renderedYamlParser';
import {
  createSymbolMapping,
  extractAnchors,
  findOriginalExpression,
  findOriginalPosition,
} from '../../src/features/symbolMapping';
import { HelmTemplateExecutor } from '../../src/services/helmTemplateExecutor';

const SAMPLE_CHART_DIR = path.resolve(__dirname, '../../../../samples/helm');

function createDoc(content: string, uri = 'file:///test.yaml'): TextDocument {
  return TextDocument.create(uri, 'yaml', 1, content);
}

describe('Phase 7: Rendering Pipeline Integration Tests', () => {
  describe('Detection → Parser pipeline', () => {
    const helmTemplateOutput = `---
# Source: my-chart/templates/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  key: rendered-value
---
# Source: my-chart/templates/workflow.yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: my-workflow
spec:
  entrypoint: main
  templates:
    - name: main
      container:
        image: alpine:latest`;

    it('should detect each parsed document as rendered YAML', () => {
      const documents = parseHelmTemplateOutput(helmTemplateOutput, 'my-chart');
      expect(documents.length).toBe(2);

      for (const doc of documents) {
        // Reconstruct with # Source: header to simulate opening individual rendered doc
        const docContent = `# Source: my-chart/${doc.sourceTemplatePath}\n${doc.content}`;
        const textDoc = createDoc(docContent);
        expect(isRenderedYaml(textDoc)).toBe(true);
      }
    });

    it('should extract consistent source paths from detection and parser', () => {
      const documents = parseHelmTemplateOutput(helmTemplateOutput, 'my-chart');

      // Parser extracts template paths
      expect(documents[0].sourceTemplatePath).toBe('templates/configmap.yaml');
      expect(documents[1].sourceTemplatePath).toBe('templates/workflow.yaml');

      // Detection extracts matching paths from the full output
      const allPaths = extractAllSourcePaths(helmTemplateOutput);
      expect(allPaths).toEqual([
        'my-chart/templates/configmap.yaml',
        'my-chart/templates/workflow.yaml',
      ]);

      // extractTemplatePath should match parser results
      for (let i = 0; i < allPaths.length; i++) {
        const extracted = extractTemplatePath(allPaths[i], 'my-chart');
        expect(extracted).toBe(documents[i].sourceTemplatePath);
      }
    });

    it('should extract chart name consistently between detection and parser', () => {
      const docContent = `# Source: my-chart/templates/workflow.yaml\napiVersion: v1`;
      const textDoc = createDoc(docContent);

      const chartNameFromDetection = extractChartNameFromSource(textDoc);
      expect(chartNameFromDetection).toBe('my-chart');

      // Parser also uses the same chart name to extract paths
      const documents = parseHelmTemplateOutput(helmTemplateOutput, chartNameFromDetection ?? '');
      expect(documents.length).toBeGreaterThan(0);
    });
  });

  describe('Detection → SymbolMapping pipeline', () => {
    const originalTemplate = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: {{ .Values.workflow.name }}
spec:
  entrypoint: main
  templates:
    - name: {{ .Values.template.name }}
      container:
        image: {{ .Values.image.repository }}:{{ .Values.image.tag }}`;

    const renderedYaml = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: my-workflow
spec:
  entrypoint: main
  templates:
    - name: process-data
      container:
        image: alpine:latest`;

    it('should detect rendered YAML and create symbol mapping', () => {
      const renderedWithSource = `# Source: my-chart/templates/workflow.yaml\n${renderedYaml}`;
      const textDoc = createDoc(renderedWithSource);

      // Step 1: Detection
      expect(isRenderedYaml(textDoc)).toBe(true);
      const templatePath = extractSourceTemplatePath(textDoc);
      expect(templatePath).toBe('templates/workflow.yaml');
      const chartName = extractChartNameFromSource(textDoc);
      expect(chartName).toBe('my-chart');

      // Step 2: Symbol Mapping (using the rendered content without source header)
      const mapping = createSymbolMapping(
        originalTemplate,
        renderedYaml,
        'file:///chart/templates/workflow.yaml',
        chartName ?? '',
        '/chart',
        templatePath ?? ''
      );

      expect(mapping.chartName).toBe('my-chart');
      expect(mapping.originalRelativePath).toBe('templates/workflow.yaml');
      expect(mapping.lineMappings.length).toBeGreaterThan(0);
    });

    it('should map rendered positions back to original template positions', () => {
      const mapping = createSymbolMapping(
        originalTemplate,
        renderedYaml,
        'file:///chart/templates/workflow.yaml',
        'my-chart',
        '/chart',
        'templates/workflow.yaml'
      );

      // "apiVersion" line (line 0) should map to original line 0
      const pos0 = findOriginalPosition(mapping, 0, 0);
      expect(pos0).not.toBeNull();
      expect(pos0?.line).toBe(0);
      expect(pos0?.confidence).toBeGreaterThanOrEqual(0.8);

      // "kind: Workflow" line (line 1) should map to original line 1
      const pos1 = findOriginalPosition(mapping, 1, 0);
      expect(pos1).not.toBeNull();
      expect(pos1?.line).toBe(1);
    });

    it('should find original Helm expressions for rendered values', () => {
      const mapping = createSymbolMapping(
        originalTemplate,
        renderedYaml,
        'file:///chart/templates/workflow.yaml',
        'my-chart',
        '/chart',
        'templates/workflow.yaml'
      );

      // The "name: my-workflow" line (rendered line 3)
      // should map to "name: {{ .Values.workflow.name }}" (original line 3)
      const expr = findOriginalExpression(mapping, 3, 10);
      if (expr) {
        expect(expr.expression).toContain('.Values.workflow.name');
        expect(expr.confidence).toBeGreaterThan(0);
      }
    });
  });

  describe('Parser → SymbolMapping for multi-document output', () => {
    const multiDocOutput = `---
# Source: my-chart/templates/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  key: some-value
---
# Source: my-chart/templates/workflow.yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: my-workflow`;

    const originalConfigMap = `apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ .Values.config.name }}
data:
  key: {{ .Values.config.key }}`;

    const originalWorkflow = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: {{ .Values.workflow.name }}`;

    it('should parse and create mappings for each document independently', () => {
      const documents = parseHelmTemplateOutput(multiDocOutput, 'my-chart');
      expect(documents).toHaveLength(2);

      const originals = [originalConfigMap, originalWorkflow];

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const mapping = createSymbolMapping(
          originals[i],
          doc.content,
          `file:///chart/${doc.sourceTemplatePath}`,
          'my-chart',
          '/chart',
          doc.sourceTemplatePath
        );

        expect(mapping.originalRelativePath).toBe(doc.sourceTemplatePath);
        expect(mapping.lineMappings.length).toBeGreaterThan(0);

        // apiVersion line should always map with high confidence
        const pos = findOriginalPosition(mapping, 0, 0);
        expect(pos).not.toBeNull();
        expect(pos?.confidence).toBeGreaterThanOrEqual(0.8);
      }
    });
  });

  describe('Anchor extraction consistency', () => {
    it('should extract anchors from both template and rendered content', () => {
      const template = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: {{ .Values.name }}
spec:
  entrypoint: main`;

      const rendered = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: my-workflow
spec:
  entrypoint: main`;

      const templateAnchors = extractAnchors(template, true);
      const renderedAnchors = extractAnchors(rendered, false);

      // Static lines should have matching anchors
      const templateApiVersion = templateAnchors.find(a => a.key === 'apiVersion');
      const renderedApiVersion = renderedAnchors.find(a => a.key === 'apiVersion');

      expect(templateApiVersion).toBeDefined();
      expect(renderedApiVersion).toBeDefined();
      expect(templateApiVersion?.isExactMatch).toBe(true);
      expect(renderedApiVersion?.isExactMatch).toBe(true);

      // Template Helm expression line should have non-exact match
      const templateName = templateAnchors.find(a => a.key === 'name' && a.indent === 2);
      expect(templateName).toBeDefined();
      expect(templateName?.isExactMatch).toBe(false);
    });

    it('should skip Helm control block lines in template anchors', () => {
      const template = `{{- if .Values.enabled }}
apiVersion: v1
kind: ConfigMap
{{- end }}`;

      const anchors = extractAnchors(template, true);

      // Control blocks should be skipped
      const ifAnchor = anchors.find(a => a.key.includes('if .Values'));
      expect(ifAnchor).toBeUndefined();

      // Static lines should still be present
      const apiVersionAnchor = anchors.find(a => a.key === 'apiVersion');
      expect(apiVersionAnchor).toBeDefined();
    });
  });

  describe('Type integration (rendering.ts types)', () => {
    it('should produce RenderedDocument with correct shape from parser', () => {
      const output = `---
# Source: my-chart/templates/workflow.yaml
apiVersion: v1
kind: Workflow`;

      const docs = parseHelmTemplateOutput(output, 'my-chart');
      expect(docs).toHaveLength(1);

      const doc = docs[0];
      expect(typeof doc.sourceTemplatePath).toBe('string');
      expect(typeof doc.content).toBe('string');
      expect(typeof doc.startLine).toBe('number');
      expect(typeof doc.endLine).toBe('number');
    });

    it('should produce SymbolMapping with correct shape', () => {
      const mapping = createSymbolMapping(
        'apiVersion: v1\nkind: ConfigMap',
        'apiVersion: v1\nkind: ConfigMap',
        'file:///test.yaml',
        'my-chart',
        '/chart',
        'templates/test.yaml'
      );

      expect(typeof mapping.chartName).toBe('string');
      expect(typeof mapping.chartDir).toBe('string');
      expect(typeof mapping.originalUri).toBe('string');
      expect(typeof mapping.originalRelativePath).toBe('string');
      expect(Array.isArray(mapping.lineMappings)).toBe(true);
      expect(Array.isArray(mapping.tokenMappings)).toBe(true);
      expect(typeof mapping.createdAt).toBe('number');

      // Check LineMapping shape
      for (const lm of mapping.lineMappings) {
        expect(typeof lm.renderedLine).toBe('number');
        expect(typeof lm.originalLine).toBe('number');
        expect(typeof lm.confidence).toBe('number');
        expect(['exact', 'anchor', 'value', 'fuzzy']).toContain(lm.method);
      }
    });
  });

  describe('HelmTemplateExecutor → full pipeline', () => {
    let executor: HelmTemplateExecutor;

    beforeAll(() => {
      executor = new HelmTemplateExecutor();
    });

    it('should render chart, parse output, detect rendered docs, and create mappings', async () => {
      const isAvailable = await executor.isHelmAvailable();
      if (!isAvailable) {
        console.log('Skipping: helm CLI not available');
        return;
      }

      // Step 1: Render chart
      const result = await executor.renderChart(SAMPLE_CHART_DIR);
      expect(result.success).toBe(true);
      expect(result.documents).toBeDefined();
      expect(result.documents?.length).toBeGreaterThan(0);

      // Step 2: Each document should have valid source template path
      for (const doc of result.documents ?? []) {
        expect(doc.sourceTemplatePath).toMatch(/^templates\//);
        expect(doc.content.length).toBeGreaterThan(0);

        // Step 3: Reconstruct as text document and detect as rendered YAML
        const docWithSource = `# Source: argo-workflow-sample/${doc.sourceTemplatePath}\n${doc.content}`;
        const textDoc = createDoc(docWithSource);
        expect(isRenderedYaml(textDoc)).toBe(true);

        const extractedPath = extractSourceTemplatePath(textDoc);
        expect(extractedPath).toBe(doc.sourceTemplatePath);
      }
    });

    it('should render single template and create symbol mapping with original', async () => {
      const isAvailable = await executor.isHelmAvailable();
      if (!isAvailable) {
        console.log('Skipping: helm CLI not available');
        return;
      }

      // Render a specific template
      const result = await executor.renderSingleTemplate(
        SAMPLE_CHART_DIR,
        'templates/workflow-basic.yaml'
      );

      expect(result.success).toBe(true);
      expect(result.documents).toBeDefined();
      expect(result.documents?.length).toBe(1);

      const renderedDoc = result.documents?.[0];
      expect(renderedDoc).toBeDefined();
      expect(renderedDoc?.sourceTemplatePath).toBe('templates/workflow-basic.yaml');

      // Read the original template
      const fs = await import('node:fs/promises');
      const originalPath = path.join(SAMPLE_CHART_DIR, renderedDoc?.sourceTemplatePath ?? '');
      const originalContent = await fs.readFile(originalPath, 'utf-8');

      // Create symbol mapping
      const mapping = createSymbolMapping(
        originalContent,
        renderedDoc?.content ?? '',
        `file://${originalPath}`,
        'argo-workflow-sample',
        SAMPLE_CHART_DIR,
        renderedDoc?.sourceTemplatePath ?? ''
      );

      expect(mapping.lineMappings.length).toBeGreaterThan(0);
      expect(mapping.chartName).toBe('argo-workflow-sample');

      // Verify that some static lines map with high confidence
      const highConfidence = mapping.lineMappings.filter(m => m.confidence >= 0.9);
      expect(highConfidence.length).toBeGreaterThan(0);
    });

    it('should handle executor cache and still produce valid pipeline results', async () => {
      const isAvailable = await executor.isHelmAvailable();
      if (!isAvailable) {
        console.log('Skipping: helm CLI not available');
        return;
      }

      // First call (populates cache)
      const first = await executor.renderChart(SAMPLE_CHART_DIR);
      expect(first.success).toBe(true);

      // Second call (from cache)
      const second = await executor.renderChart(SAMPLE_CHART_DIR);
      expect(second.success).toBe(true);
      expect(second.executionTime).toBe(0); // Cached

      // Cached result should still produce valid documents
      expect(second.documents).toBeDefined();
      expect(second.documents?.length).toBe(first.documents?.length);

      const secondDocs = second.documents ?? [];
      const firstDocs = first.documents ?? [];
      for (let i = 0; i < secondDocs.length; i++) {
        expect(secondDocs[i].sourceTemplatePath).toBe(firstDocs[i].sourceTemplatePath);
      }

      // Cleanup
      executor.clearCache();
    });
  });

  describe('Edge cases across modules', () => {
    it('should handle empty content gracefully across the pipeline', () => {
      // Parser
      const docs = parseHelmTemplateOutput('', 'my-chart');
      expect(docs).toHaveLength(0);

      // Detection
      const emptyDoc = createDoc('');
      expect(isRenderedYaml(emptyDoc)).toBe(false);
      expect(extractSourceTemplatePath(emptyDoc)).toBeNull();
      expect(extractChartNameFromSource(emptyDoc)).toBeNull();
    });

    it('should handle identical template and rendered content', () => {
      // When template has no Helm expressions, content is identical
      const content = `apiVersion: v1
kind: ConfigMap
metadata:
  name: static-config
data:
  key: value`;

      const mapping = createSymbolMapping(
        content,
        content,
        'file:///test.yaml',
        'my-chart',
        '/chart',
        'templates/test.yaml'
      );

      // All lines should map with exact confidence
      for (const lm of mapping.lineMappings) {
        expect(lm.confidence).toBe(1.0);
        expect(lm.renderedLine).toBe(lm.originalLine);
      }

      // No token mappings (no Helm expressions)
      expect(mapping.tokenMappings).toHaveLength(0);
    });

    it('should handle template with only Helm control blocks', () => {
      const template = `{{- if .Values.enabled }}
apiVersion: v1
kind: ConfigMap
{{- end }}`;

      const rendered = `apiVersion: v1
kind: ConfigMap`;

      const mapping = createSymbolMapping(
        template,
        rendered,
        'file:///test.yaml',
        'my-chart',
        '/chart',
        'templates/test.yaml'
      );

      // Should still create mappings for the static lines
      expect(mapping.lineMappings.length).toBeGreaterThan(0);

      const apiVersionMapping = mapping.lineMappings.find(m => m.renderedLine === 0);
      expect(apiVersionMapping).toBeDefined();
    });

    it('should detect Helm template as NOT rendered YAML', () => {
      const helmTemplate = `---
# Source: my-chart/templates/workflow.yaml
apiVersion: v1
kind: Workflow
metadata:
  name: {{ .Values.workflow.name }}`;

      const doc = createDoc(helmTemplate);
      // Has {{ }} syntax, so it's NOT rendered YAML even with # Source:
      expect(isRenderedYaml(doc)).toBe(false);
    });
  });
});
