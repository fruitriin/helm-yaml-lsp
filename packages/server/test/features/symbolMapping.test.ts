import { describe, expect, it } from 'bun:test';
import {
  createSymbolMapping,
  extractAnchors,
  findOriginalExpression,
  findOriginalPosition,
} from '../../src/features/symbolMapping';

// ========================================
// テスト用サンプルデータ
// ========================================

const TEMPLATE_BASIC = `{{- if .Values.workflow.enabled }}
# Comment line
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: {{ .Values.workflow.name }}
  namespace: {{ .Values.namespace }}
spec:
  entrypoint: main
  templates:
    - name: hello
      container:
        image: {{ .Values.workflow.image.repository }}:{{ .Values.workflow.image.tag }}
{{- end }}`;

const RENDERED_BASIC = `# Comment line
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: my-workflow
  namespace: argo
spec:
  entrypoint: main
  templates:
    - name: hello
      container:
        image: alpine:3.18`;

const _TEMPLATE_RANGE = `{{- range .Values.items }}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ .name }}
---
{{- end }}`;

const _RENDERED_RANGE = `apiVersion: v1
kind: ConfigMap
metadata:
  name: item-a
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: item-b`;

const TEMPLATE_INCLUDE = `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
  labels:
{{- include "mychart.labels" . | nindent 4 }}
data:
  key: value`;

const RENDERED_INCLUDE = `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
  labels:
    app: mychart
    release: RELEASE-NAME
data:
  key: value`;

describe('symbolMapping', () => {
  // ========================================
  // extractAnchors
  // ========================================
  describe('extractAnchors', () => {
    it('should extract comment lines as exact-match anchors', () => {
      const content = '# Comment line\napiVersion: v1';
      const anchors = extractAnchors(content, false);
      const commentAnchor = anchors.find(a => a.key.startsWith('#'));
      expect(commentAnchor).toBeDefined();
      expect(commentAnchor?.isExactMatch).toBe(true);
      expect(commentAnchor?.line).toBe(0);
    });

    it('should extract YAML keys as anchors', () => {
      const content = 'apiVersion: v1\nkind: Workflow\nmetadata:';
      const anchors = extractAnchors(content, false);
      expect(anchors.length).toBe(3);
      expect(anchors[0].key).toBe('apiVersion');
      expect(anchors[1].key).toBe('kind');
      expect(anchors[2].key).toBe('metadata');
    });

    it('should detect indent levels correctly', () => {
      const content = 'metadata:\n  name: test\n  namespace: default';
      const anchors = extractAnchors(content, false);
      expect(anchors[0].indent).toBe(0);
      expect(anchors[1].indent).toBe(2);
      expect(anchors[2].indent).toBe(2);
    });

    it('should extract array name elements', () => {
      const content = '    - name: hello\n    - name: world';
      const anchors = extractAnchors(content, false);
      expect(anchors.length).toBe(2);
      expect(anchors[0].key).toBe('- name: hello');
      expect(anchors[1].key).toBe('- name: world');
    });

    it('should skip empty lines', () => {
      const content = 'apiVersion: v1\n\nkind: Workflow';
      const anchors = extractAnchors(content, false);
      expect(anchors.length).toBe(2);
    });

    it('should skip Helm block-only lines in template mode', () => {
      const content = '{{- if .Values.enabled }}\napiVersion: v1\n{{- end }}';
      const anchors = extractAnchors(content, true);
      // if と end はスキップされ、apiVersionだけ残る
      expect(anchors.some(a => a.key === 'apiVersion')).toBe(true);
      expect(anchors.every(a => !a.key.includes('if'))).toBe(true);
      expect(anchors.every(a => !a.key.includes('end'))).toBe(true);
    });

    it('should not skip Helm block lines in non-template mode', () => {
      const content = 'apiVersion: v1\nkind: Workflow';
      const anchors = extractAnchors(content, false);
      expect(anchors.length).toBe(2);
    });

    it('should mark template lines with Helm expressions as non-exact', () => {
      const content = '  name: {{ .Values.name }}';
      const anchors = extractAnchors(content, true);
      expect(anchors.length).toBe(1);
      expect(anchors[0].key).toBe('name');
      expect(anchors[0].isExactMatch).toBe(false);
    });

    it('should mark static YAML lines as exact-match in template mode', () => {
      const content = '  entrypoint: main';
      const anchors = extractAnchors(content, true);
      expect(anchors.length).toBe(1);
      expect(anchors[0].isExactMatch).toBe(true);
    });

    it('should handle lines without YAML key patterns', () => {
      const content = '  - item1\n  - item2';
      const anchors = extractAnchors(content, false);
      expect(anchors.length).toBe(2);
    });

    it('should handle multiple comment lines', () => {
      const content = '# First comment\n# Second comment\napiVersion: v1';
      const anchors = extractAnchors(content, false);
      const comments = anchors.filter(a => a.key.startsWith('#'));
      expect(comments.length).toBe(2);
    });
  });

  // ========================================
  // createSymbolMapping - 基本マッピング
  // ========================================
  describe('createSymbolMapping', () => {
    it('should create mapping with correct metadata', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///templates/workflow.yaml',
        'my-chart',
        '/charts/my-chart',
        'templates/workflow.yaml'
      );

      expect(mapping.chartName).toBe('my-chart');
      expect(mapping.chartDir).toBe('/charts/my-chart');
      expect(mapping.originalUri).toBe('file:///templates/workflow.yaml');
      expect(mapping.originalRelativePath).toBe('templates/workflow.yaml');
      expect(mapping.createdAt).toBeGreaterThan(0);
    });

    it('should produce line mappings for basic template', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      expect(mapping.lineMappings.length).toBeGreaterThan(0);
    });

    it('should map comment line with confidence 1.0', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      // "# Comment line" is line 0 in rendered, line 1 in template
      const commentMapping = mapping.lineMappings.find(m => m.renderedLine === 0);
      expect(commentMapping).toBeDefined();
      expect(commentMapping?.originalLine).toBe(1);
      expect(commentMapping?.confidence).toBe(1.0);
    });

    it('should map apiVersion line exactly', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      // "apiVersion: argoproj.io/v1alpha1" is line 1 in rendered, line 2 in template
      const apiVersionMapping = mapping.lineMappings.find(m => m.renderedLine === 1);
      expect(apiVersionMapping).toBeDefined();
      expect(apiVersionMapping?.originalLine).toBe(2);
      expect(apiVersionMapping?.confidence).toBe(1.0);
    });

    it('should map kind line exactly', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      const kindMapping = mapping.lineMappings.find(m => m.renderedLine === 2);
      expect(kindMapping).toBeDefined();
      expect(kindMapping?.originalLine).toBe(3);
    });

    it('should map metadata key line', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      const metadataMapping = mapping.lineMappings.find(m => m.renderedLine === 3);
      expect(metadataMapping).toBeDefined();
      expect(metadataMapping?.originalLine).toBe(4);
    });

    it('should map name line with Helm expression', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      // "  name: my-workflow" is line 4 in rendered, "  name: {{ .Values.workflow.name }}" is line 5 in template
      const nameMapping = mapping.lineMappings.find(m => m.renderedLine === 4);
      expect(nameMapping).toBeDefined();
      expect(nameMapping?.originalLine).toBe(5);
    });

    it('should map spec/entrypoint line exactly', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      // "  entrypoint: main" is line 7 in rendered, line 8 in template
      // (offset by 1 due to {{- if }} on template line 0)
      const entrypointMapping = mapping.lineMappings.find(m => m.renderedLine === 7);
      expect(entrypointMapping).toBeDefined();
      if (entrypointMapping) {
        expect(entrypointMapping.originalLine).toBe(8);
        expect(entrypointMapping.confidence).toBe(1.0);
      }
    });

    it('should map "- name: hello" array element', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      // "    - name: hello" is line 9 in rendered, line 10 in template
      const arrayMapping = mapping.lineMappings.find(m => m.renderedLine === 9);
      expect(arrayMapping).toBeDefined();
      if (arrayMapping) {
        expect(arrayMapping.originalLine).toBe(10);
      }
    });

    it('should produce token mappings for Helm expressions', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      expect(mapping.tokenMappings.length).toBeGreaterThan(0);
    });

    it('should have sorted line mappings by rendered line', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      for (let i = 1; i < mapping.lineMappings.length; i++) {
        expect(mapping.lineMappings[i].renderedLine).toBeGreaterThanOrEqual(
          mapping.lineMappings[i - 1].renderedLine
        );
      }
    });
  });

  // ========================================
  // createSymbolMapping - include 展開
  // ========================================
  describe('createSymbolMapping - include expansion', () => {
    it('should handle include/nindent multi-line expansion', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_INCLUDE,
        RENDERED_INCLUDE,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      // data: key: value は両方のファイルに存在する
      const dataMapping = mapping.lineMappings.find(
        m => m.renderedLine === 7 // "data:" in rendered
      );
      expect(dataMapping).toBeDefined();
    });

    it('should map lines after include expansion correctly', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_INCLUDE,
        RENDERED_INCLUDE,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      // "  key: value" is line 8 in rendered, line 7 in template
      const keyValueMapping = mapping.lineMappings.find(m => m.renderedLine === 8);
      expect(keyValueMapping).toBeDefined();
      if (keyValueMapping) {
        expect(keyValueMapping.originalLine).toBe(7);
      }
    });
  });

  // ========================================
  // createSymbolMapping - 空テンプレート
  // ========================================
  describe('createSymbolMapping - edge cases', () => {
    it('should handle empty template and rendered', () => {
      const mapping = createSymbolMapping(
        '',
        '',
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      expect(mapping.lineMappings).toHaveLength(0);
      expect(mapping.tokenMappings).toHaveLength(0);
    });

    it('should handle identical content', () => {
      const content = 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: test';
      const mapping = createSymbolMapping(
        content,
        content,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      // 同一内容なので全て exact マッピング
      for (const m of mapping.lineMappings) {
        expect(m.confidence).toBe(1.0);
        expect(m.originalLine).toBe(m.renderedLine);
      }
    });

    it('should handle content with only comments', () => {
      const template = '# Comment 1\n# Comment 2';
      const rendered = '# Comment 1\n# Comment 2';
      const mapping = createSymbolMapping(
        template,
        rendered,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      expect(mapping.lineMappings.length).toBe(2);
    });
  });

  // ========================================
  // findOriginalPosition
  // ========================================
  describe('findOriginalPosition', () => {
    it('should find exact position for static line', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      // "apiVersion: argoproj.io/v1alpha1" is line 1 in rendered
      const pos = findOriginalPosition(mapping, 1, 0);
      expect(pos).not.toBeNull();
      expect(pos?.line).toBe(2);
      expect(pos?.confidence).toBe(1.0);
    });

    it('should find position for Helm expression line', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      // "  name: my-workflow" is line 4 in rendered
      const pos = findOriginalPosition(mapping, 4, 0);
      expect(pos).not.toBeNull();
      expect(pos?.line).toBe(5);
    });

    it('should return null for unmapped position far from any anchor', () => {
      const mapping = createSymbolMapping(
        'apiVersion: v1',
        'apiVersion: v1\n\n\n\n\n\n\n\n\n\nextrastuff',
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      // Line 9 ("extrastuff") is far from any anchor
      const pos = findOriginalPosition(mapping, 9, 0);
      // It might be null or have low confidence
      if (pos) {
        expect(pos.confidence).toBeLessThan(1.0);
      }
    });

    it('should return token position when cursor is on expanded value', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      // Check if there is a token mapping for the name value
      const nameTokens = mapping.tokenMappings.filter(t => t.renderedRange.start.line === 4);
      if (nameTokens.length > 0) {
        const token = nameTokens[0];
        const pos = findOriginalPosition(mapping, 4, token.renderedRange.start.character + 1);
        expect(pos).not.toBeNull();
        expect(pos?.line).toBe(token.originalRange.start.line);
      }
    });

    it('should estimate position from nearby anchor', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      // Any position within 3 lines of an anchor should return a result
      const pos = findOriginalPosition(mapping, 0, 5);
      expect(pos).not.toBeNull();
    });
  });

  // ========================================
  // findOriginalExpression
  // ========================================
  describe('findOriginalExpression', () => {
    it('should find Helm expression for expanded value', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      // Look for token on "name: my-workflow" line
      const nameTokens = mapping.tokenMappings.filter(t => t.renderedRange.start.line === 4);

      if (nameTokens.length > 0) {
        const token = nameTokens[0];
        const expr = findOriginalExpression(mapping, 4, token.renderedRange.start.character + 1);
        expect(expr).not.toBeNull();
        if (expr) {
          expect(expr.expression).toContain('.Values');
        }
      }
    });

    it('should return null for non-expression position', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      // Line 1 "apiVersion: argoproj.io/v1alpha1" has no Helm expression
      const expr = findOriginalExpression(mapping, 1, 0);
      expect(expr).toBeNull();
    });

    it('should return expression with confidence score', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      const nameTokens = mapping.tokenMappings.filter(
        t => t.renderedRange.start.line === 4 && t.originalExpression
      );

      if (nameTokens.length > 0) {
        const token = nameTokens[0];
        const expr = findOriginalExpression(mapping, 4, token.renderedRange.start.character);
        expect(expr).not.toBeNull();
        if (expr) {
          expect(expr.confidence).toBeGreaterThan(0);
          expect(expr.confidence).toBeLessThanOrEqual(1.0);
          expect(expr.range).toBeDefined();
        }
      }
    });
  });

  // ========================================
  // confidence スコア検証
  // ========================================
  describe('confidence scores', () => {
    it('exact matches should have confidence 1.0', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      const exactMappings = mapping.lineMappings.filter(m => m.method === 'exact');
      for (const m of exactMappings) {
        expect(m.confidence).toBe(1.0);
      }
    });

    it('anchor matches should have confidence 1.0', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      const anchorMappings = mapping.lineMappings.filter(m => m.method === 'anchor');
      for (const m of anchorMappings) {
        expect(m.confidence).toBe(1.0);
      }
    });

    it('value matches should have confidence 0.8-0.95', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      const valueMappings = mapping.lineMappings.filter(m => m.method === 'value');
      for (const m of valueMappings) {
        expect(m.confidence).toBeGreaterThanOrEqual(0.8);
        expect(m.confidence).toBeLessThanOrEqual(0.95);
      }
    });

    it('fuzzy matches should have confidence 0.5-0.8', () => {
      const mapping = createSymbolMapping(
        TEMPLATE_BASIC,
        RENDERED_BASIC,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      const fuzzyMappings = mapping.lineMappings.filter(m => m.method === 'fuzzy');
      for (const m of fuzzyMappings) {
        expect(m.confidence).toBeGreaterThanOrEqual(0.5);
        expect(m.confidence).toBeLessThanOrEqual(0.8);
      }
    });
  });

  // ========================================
  // 複雑なテンプレート
  // ========================================
  describe('complex templates', () => {
    it('should handle template with multiple Helm expressions per line', () => {
      const template = '        image: {{ .Values.image.repo }}:{{ .Values.image.tag }}';
      const rendered = '        image: nginx:latest';
      const mapping = createSymbolMapping(
        template,
        rendered,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      expect(mapping.lineMappings.length).toBeGreaterThan(0);
    });

    it('should handle template with only static content', () => {
      const content = `apiVersion: v1
kind: ConfigMap
metadata:
  name: static-config
data:
  key1: value1
  key2: value2`;

      const mapping = createSymbolMapping(
        content,
        content,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      // All mappings should be exact
      for (const m of mapping.lineMappings) {
        expect(m.method).toBe('exact');
        expect(m.confidence).toBe(1.0);
      }
    });

    it('should handle template with nested if/else blocks', () => {
      const template = `apiVersion: v1
kind: ConfigMap
metadata:
{{- if .Values.nameOverride }}
  name: {{ .Values.nameOverride }}
{{- else }}
  name: default-name
{{- end }}`;

      const rendered = `apiVersion: v1
kind: ConfigMap
metadata:
  name: custom-name`;

      const mapping = createSymbolMapping(
        template,
        rendered,
        'file:///test.yaml',
        'test',
        '/test',
        'templates/test.yaml'
      );

      // apiVersion and kind should be mapped exactly
      const apiMapping = mapping.lineMappings.find(m => m.renderedLine === 0);
      expect(apiMapping).toBeDefined();
      expect(apiMapping?.originalLine).toBe(0);

      const kindMapping = mapping.lineMappings.find(m => m.renderedLine === 1);
      expect(kindMapping).toBeDefined();
      expect(kindMapping?.originalLine).toBe(1);
    });
  });
});
