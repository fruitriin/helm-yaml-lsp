/**
 * Diagnostic Provider - Helm Rendered Diagnostics Test (Phase 13)
 *
 * Helm テンプレートをレンダリングした後の YAML に対して
 * Argo/ConfigMap 診断を走らせる機能のテスト。
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver-types';
import { DiagnosticProvider } from '../../src/providers/diagnosticProvider';
import { ReferenceRegistry } from '../../src/references/registry';
import { ArgoTemplateIndex } from '../../src/services/argoTemplateIndex';
import type { HelmChartIndex } from '../../src/services/helmChartIndex';
import type { HelmTemplateExecutor } from '../../src/services/helmTemplateExecutor';
import { RenderedArgoIndexCache } from '../../src/services/renderedArgoIndexCache';
import type { SymbolMappingIndex } from '../../src/services/symbolMappingIndex';
import type { HelmRenderResult } from '../../src/types/rendering';

// Mock: HelmTemplateExecutor
function createMockExecutor(options: {
  helmAvailable: boolean;
  renderChartResult?: HelmRenderResult;
}): HelmTemplateExecutor {
  return {
    isHelmAvailable: async () => options.helmAvailable,
    renderSingleTemplate: async () => ({ success: false, executionTime: 0, error: 'not impl' }),
    renderChart: async () =>
      options.renderChartResult ?? { success: false, executionTime: 0, error: 'mock error' },
    clearCache: () => {},
  } as unknown as HelmTemplateExecutor;
}

// Mock: HelmChartIndex
function createMockChartIndex(rootDir?: string): HelmChartIndex {
  return {
    findChartForFile: () =>
      rootDir
        ? { name: 'test-chart', rootDir, chartYamlUri: `file://${rootDir}/Chart.yaml` }
        : undefined,
    getAllCharts: () => [],
    setWorkspaceFolders: () => {},
    initialize: async () => {},
    updateChart: async () => {},
  } as unknown as HelmChartIndex;
}

// Mock: SymbolMappingIndex
function createMockSymbolMappingIndex(options?: {
  confidence?: number;
  line?: number;
  character?: number;
}): SymbolMappingIndex {
  const conf = options?.confidence ?? 1.0;
  return {
    findOriginalLocation: async (
      _chartDir: string,
      _templatePath: string,
      renderedLine: number,
      renderedCharacter: number
    ) =>
      conf >= 0
        ? {
            line: options?.line ?? renderedLine,
            character: options?.character ?? renderedCharacter,
            confidence: conf,
          }
        : null,
    getOrCreateMapping: async () => null,
    findMapping: () => null,
    findOriginalHelmExpression: async () => null,
    invalidate: () => {},
    clear: () => {},
  } as unknown as SymbolMappingIndex;
}

describe('DiagnosticProvider - Helm Rendered Diagnostics (Phase 13)', () => {
  let templateIndex: ArgoTemplateIndex;

  beforeEach(() => {
    templateIndex = new ArgoTemplateIndex();
  });

  describe('Helm テンプレート + helm CLI あり', () => {
    it('should run Argo diagnostics on rendered YAML and map positions back', async () => {
      const renderedContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: main
      steps:
        - - name: step1
            template: non-existent
`;
      const helmExecutor = createMockExecutor({
        helmAvailable: true,
        renderChartResult: {
          success: true,
          output: 'rendered',
          documents: [
            {
              sourceTemplatePath: 'templates/workflow.yaml',
              content: renderedContent,
              startLine: 0,
              endLine: 8,
            },
          ],
          executionTime: 100,
        },
      });

      const chartIndex = createMockChartIndex('/charts/test');
      const symbolMapping = createMockSymbolMappingIndex({ confidence: 1.0 });

      const directRegistry = new ReferenceRegistry();
      directRegistry.validateAll = async () => [];

      const provider = new DiagnosticProvider(
        templateIndex,
        chartIndex,
        undefined,
        undefined,
        undefined,
        directRegistry,
        helmExecutor,
        symbolMapping,
        undefined,
        new RenderedArgoIndexCache(helmExecutor)
      );

      // isHelmTemplate = true になるように helm languageId を使用
      const doc = TextDocument.create(
        'file:///charts/test/templates/workflow.yaml',
        'helm',
        1,
        '{{ .Values.test }}\napiVersion: argoproj.io/v1alpha1\nkind: Workflow\n'
      );

      const diagnostics = await provider.provideDiagnostics(doc);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].message).toContain('non-existent');
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
    });

    it('should resolve templateRef across rendered documents', async () => {
      // WorkflowTemplate がレンダリング済み Chart に含まれている場合、
      // templateRef が正しく解決されてエラーにならないこと
      const workflowContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - name: step1
            templateRef:
              name: my-templates
              template: hello
`;
      const workflowTemplateContent = `apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: my-templates
spec:
  templates:
    - name: hello
      container:
        image: alpine
        command: [echo]
        args: ["Hello"]
`;

      const helmExecutor = createMockExecutor({
        helmAvailable: true,
        renderChartResult: {
          success: true,
          output: 'rendered',
          documents: [
            {
              sourceTemplatePath: 'templates/workflow.yaml',
              content: workflowContent,
              startLine: 0,
              endLine: 10,
            },
            {
              sourceTemplatePath: 'templates/workflow-template.yaml',
              content: workflowTemplateContent,
              startLine: 0,
              endLine: 10,
            },
          ],
          executionTime: 100,
        },
      });

      const chartIndex = createMockChartIndex('/charts/test');
      const symbolMapping = createMockSymbolMappingIndex({ confidence: 1.0 });

      const directRegistry = new ReferenceRegistry();
      directRegistry.validateAll = async () => [];

      const provider = new DiagnosticProvider(
        templateIndex,
        chartIndex,
        undefined,
        undefined,
        undefined,
        directRegistry,
        helmExecutor,
        symbolMapping,
        undefined,
        new RenderedArgoIndexCache(helmExecutor)
      );

      const doc = TextDocument.create(
        'file:///charts/test/templates/workflow.yaml',
        'helm',
        1,
        'helm template content'
      );

      const diagnostics = await provider.provideDiagnostics(doc);
      // templateRef が正しく解決されるのでエラーなし
      expect(diagnostics.length).toBe(0);
    });
  });

  describe('Helm テンプレート + helm CLI なし', () => {
    it('should return only Helm handler diagnostics when helm CLI is unavailable', async () => {
      const helmExecutor = createMockExecutor({ helmAvailable: false });
      const chartIndex = createMockChartIndex('/charts/test');

      const directRegistry = new ReferenceRegistry();
      directRegistry.validateAll = async () => [];

      const provider = new DiagnosticProvider(
        templateIndex,
        chartIndex,
        undefined,
        undefined,
        undefined,
        directRegistry,
        helmExecutor
      );

      const doc = TextDocument.create(
        'file:///charts/test/templates/workflow.yaml',
        'helm',
        1,
        'apiVersion: argoproj.io/v1alpha1\nkind: Workflow\n'
      );

      const diagnostics = await provider.provideDiagnostics(doc);
      expect(diagnostics.length).toBe(0);
    });
  });

  describe('レンダリング失敗', () => {
    it('should return only direct diagnostics when rendering fails', async () => {
      const helmExecutor = createMockExecutor({
        helmAvailable: true,
        renderChartResult: { success: false, executionTime: 50, error: 'render error' },
      });

      const chartIndex = createMockChartIndex('/charts/test');

      const directRegistry = new ReferenceRegistry();
      directRegistry.validateAll = async () => [];

      const provider = new DiagnosticProvider(
        templateIndex,
        chartIndex,
        undefined,
        undefined,
        undefined,
        directRegistry,
        helmExecutor
      );

      const doc = TextDocument.create(
        'file:///charts/test/templates/workflow.yaml',
        'helm',
        1,
        'apiVersion: argoproj.io/v1alpha1\nkind: Workflow\n'
      );

      const diagnostics = await provider.provideDiagnostics(doc);
      expect(diagnostics.length).toBe(0);
    });
  });

  describe('位置マッピング失敗（低 confidence）', () => {
    it('should exclude diagnostics with low confidence mapping', async () => {
      const renderedContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: main
      steps:
        - - template: bad
`;
      const helmExecutor = createMockExecutor({
        helmAvailable: true,
        renderChartResult: {
          success: true,
          output: 'rendered',
          documents: [
            {
              sourceTemplatePath: 'templates/workflow.yaml',
              content: renderedContent,
              startLine: 0,
              endLine: 6,
            },
          ],
          executionTime: 100,
        },
      });

      const chartIndex = createMockChartIndex('/charts/test');
      // confidence < 0.5 → 除外
      const symbolMapping = createMockSymbolMappingIndex({ confidence: 0.3 });

      const directRegistry = new ReferenceRegistry();
      directRegistry.validateAll = async () => [];

      const provider = new DiagnosticProvider(
        templateIndex,
        chartIndex,
        undefined,
        undefined,
        undefined,
        directRegistry,
        helmExecutor,
        symbolMapping,
        undefined,
        new RenderedArgoIndexCache(helmExecutor)
      );

      const doc = TextDocument.create(
        'file:///charts/test/templates/workflow.yaml',
        'helm',
        1,
        'content'
      );

      const diagnostics = await provider.provideDiagnostics(doc);
      expect(diagnostics.length).toBe(0);
    });

    it('should downgrade to Warning for medium confidence mapping', async () => {
      const renderedContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - name: step1
            template: missing-template
`;
      const helmExecutor = createMockExecutor({
        helmAvailable: true,
        renderChartResult: {
          success: true,
          output: 'rendered',
          documents: [
            {
              sourceTemplatePath: 'templates/workflow.yaml',
              content: renderedContent,
              startLine: 0,
              endLine: 6,
            },
          ],
          executionTime: 100,
        },
      });

      const chartIndex = createMockChartIndex('/charts/test');
      // confidence 0.6 → Warning に降格
      const symbolMapping = createMockSymbolMappingIndex({ confidence: 0.6 });

      const directRegistry = new ReferenceRegistry();
      directRegistry.validateAll = async () => [];

      const provider = new DiagnosticProvider(
        templateIndex,
        chartIndex,
        undefined,
        undefined,
        undefined,
        directRegistry,
        helmExecutor,
        symbolMapping,
        undefined,
        new RenderedArgoIndexCache(helmExecutor)
      );

      const doc = TextDocument.create(
        'file:///charts/test/templates/workflow.yaml',
        'helm',
        1,
        'content'
      );

      const diagnostics = await provider.provideDiagnostics(doc);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
    });
  });

  describe('非 Helm ファイル', () => {
    it('should use direct Argo diagnostics for non-Helm files', async () => {
      const provider = new DiagnosticProvider(templateIndex);

      const doc = TextDocument.create(
        'file:///workflow.yaml',
        'yaml',
        1,
        `apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - name: step1
            template: missing
`
      );

      const diagnostics = await provider.provideDiagnostics(doc);
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].message).toContain('missing');
    });
  });

  describe('helmTemplateExecutor なしの場合', () => {
    it('should skip rendered diagnostics when helmTemplateExecutor is not provided', async () => {
      const directRegistry = new ReferenceRegistry();
      directRegistry.validateAll = async () => [];

      const provider = new DiagnosticProvider(
        templateIndex,
        createMockChartIndex('/charts/test'),
        undefined,
        undefined,
        undefined,
        directRegistry,
        // helmTemplateExecutor なし
        undefined
      );

      const doc = TextDocument.create(
        'file:///charts/test/templates/workflow.yaml',
        'helm',
        1,
        'content'
      );

      const diagnostics = await provider.provideDiagnostics(doc);
      expect(diagnostics.length).toBe(0);
    });
  });
});
