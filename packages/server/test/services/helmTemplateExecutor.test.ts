import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { HelmTemplateExecutor, parseHelmTemplateError } from '@/services/helmTemplateExecutor';

// サンプルHelmチャートのディレクトリ
// テストファイルの場所: packages/server/test/services/
// サンプルの場所: samples/helm/
const SAMPLE_CHART_DIR = path.resolve(__dirname, '../../../../samples/helm');

describe('HelmTemplateExecutor', () => {
  let executor: HelmTemplateExecutor;

  beforeEach(() => {
    executor = new HelmTemplateExecutor();
  });

  afterEach(() => {
    executor.clearCache();
  });

  describe('isHelmAvailable', () => {
    it('should return true when helm is installed', async () => {
      const available = await executor.isHelmAvailable();
      expect(available).toBe(true);
    });

    it('should cache the result on subsequent calls', async () => {
      const first = await executor.isHelmAvailable();
      const second = await executor.isHelmAvailable();
      expect(first).toBe(second);
    });
  });

  describe('renderChart', () => {
    it('should render a valid chart successfully', async () => {
      const result = await executor.renderChart(SAMPLE_CHART_DIR);
      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should return parsed documents', async () => {
      const result = await executor.renderChart(SAMPLE_CHART_DIR);
      expect(result.documents).toBeDefined();
      expect(result.documents?.length).toBeGreaterThan(0);
    });

    it('should include sourceTemplatePath in documents', async () => {
      const result = await executor.renderChart(SAMPLE_CHART_DIR);
      for (const doc of result.documents ?? []) {
        expect(doc.sourceTemplatePath).toMatch(/^templates\//);
      }
    });

    it('should include content in each document', async () => {
      const result = await executor.renderChart(SAMPLE_CHART_DIR);
      for (const doc of result.documents ?? []) {
        expect(doc.content.length).toBeGreaterThan(0);
      }
    });

    it('should record execution time', async () => {
      const result = await executor.renderChart(SAMPLE_CHART_DIR);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should use default release name lsp-preview', async () => {
      const result = await executor.renderChart(SAMPLE_CHART_DIR);
      expect(result.output).toContain('lsp-preview');
    });

    it('should accept custom release name', async () => {
      const result = await executor.renderChart(SAMPLE_CHART_DIR, 'my-release');
      expect(result.success).toBe(true);
      expect(result.output).toContain('my-release');
    });

    it('should return error for non-existent chart', async () => {
      const result = await executor.renderChart('/non/existent/chart');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should set startLine and endLine in documents', async () => {
      const result = await executor.renderChart(SAMPLE_CHART_DIR);
      for (const doc of result.documents ?? []) {
        expect(doc.startLine).toBeGreaterThanOrEqual(0);
        expect(doc.endLine).toBeGreaterThanOrEqual(doc.startLine);
      }
    });
  });

  describe('renderSingleTemplate', () => {
    it('should render a specific template only', async () => {
      const result = await executor.renderSingleTemplate(
        SAMPLE_CHART_DIR,
        'templates/workflow-basic.yaml'
      );
      expect(result.success).toBe(true);
      expect(result.documents).toBeDefined();
      expect(result.documents?.length).toBe(1);
      expect(result.documents?.[0].sourceTemplatePath).toBe('templates/workflow-basic.yaml');
    });

    it('should return error for non-existent template', async () => {
      const result = await executor.renderSingleTemplate(
        SAMPLE_CHART_DIR,
        'templates/does-not-exist.yaml'
      );
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('cache', () => {
    it('should cache renderChart results', async () => {
      const first = await executor.renderChart(SAMPLE_CHART_DIR);
      const second = await executor.renderChart(SAMPLE_CHART_DIR);

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      // Cached result has executionTime 0
      expect(second.executionTime).toBe(0);
    });

    it('should cache renderSingleTemplate results', async () => {
      const first = await executor.renderSingleTemplate(
        SAMPLE_CHART_DIR,
        'templates/workflow-basic.yaml'
      );
      const second = await executor.renderSingleTemplate(
        SAMPLE_CHART_DIR,
        'templates/workflow-basic.yaml'
      );

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      expect(second.executionTime).toBe(0);
    });

    it('should clear cache for a specific chart', async () => {
      await executor.renderChart(SAMPLE_CHART_DIR);
      executor.clearCache(SAMPLE_CHART_DIR);

      // After clearing, next call should execute helm again (executionTime > 0 or fresh)
      const result = await executor.renderChart(SAMPLE_CHART_DIR);
      expect(result.success).toBe(true);
      // executionTime should be > 0 since cache was cleared
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should clear all caches when no argument given', async () => {
      await executor.renderChart(SAMPLE_CHART_DIR);
      await executor.renderSingleTemplate(SAMPLE_CHART_DIR, 'templates/workflow-basic.yaml');

      executor.clearCache();

      const chartResult = await executor.renderChart(SAMPLE_CHART_DIR);
      const singleResult = await executor.renderSingleTemplate(
        SAMPLE_CHART_DIR,
        'templates/workflow-basic.yaml'
      );

      expect(chartResult.executionTime).toBeGreaterThan(0);
      expect(singleResult.executionTime).toBeGreaterThan(0);
    });

    it('should not clear cache for other charts when clearing specific chart', async () => {
      // Render with default release name (uses SAMPLE_CHART_DIR key)
      await executor.renderChart(SAMPLE_CHART_DIR);

      // Clear cache for a different chartDir
      executor.clearCache('/some/other/chart');

      // The original cache should still be present
      const result = await executor.renderChart(SAMPLE_CHART_DIR);
      expect(result.executionTime).toBe(0);
    });
  });
});

describe('parseHelmTemplateError', () => {
  it('should parse error with file, line, and column', () => {
    const stderr =
      'Error: template: my-chart/templates/deployment.yaml:15:3: unexpected "}" in command';
    const errors = parseHelmTemplateError(stderr);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe('templates/deployment.yaml');
    expect(errors[0].line).toBe(15);
    expect(errors[0].column).toBe(3);
    expect(errors[0].message).toBe('unexpected "}" in command');
  });

  it('should parse error with file and line only (no column)', () => {
    const stderr =
      'Error: template: my-chart/templates/service.yaml:42: function "unknownFunc" not defined';
    const errors = parseHelmTemplateError(stderr);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe('templates/service.yaml');
    expect(errors[0].line).toBe(42);
    expect(errors[0].column).toBe(0);
    expect(errors[0].message).toBe('function "unknownFunc" not defined');
  });

  it('should return empty array for non-matching stderr', () => {
    const stderr = 'WARNING: some random helm warning\nAnother line of output';
    const errors = parseHelmTemplateError(stderr);
    expect(errors).toHaveLength(0);
  });

  it('should parse multiple errors from single stderr', () => {
    const stderr = [
      'Error: template: my-chart/templates/deployment.yaml:10:5: unexpected EOF',
      'Error: template: my-chart/templates/ingress.yaml:22: missing closing brace',
    ].join('\n');
    const errors = parseHelmTemplateError(stderr);
    expect(errors).toHaveLength(2);
    expect(errors[0].file).toBe('templates/deployment.yaml');
    expect(errors[0].line).toBe(10);
    expect(errors[0].column).toBe(5);
    expect(errors[0].message).toBe('unexpected EOF');
    expect(errors[1].file).toBe('templates/ingress.yaml');
    expect(errors[1].line).toBe(22);
    expect(errors[1].column).toBe(0);
    expect(errors[1].message).toBe('missing closing brace');
  });
});
