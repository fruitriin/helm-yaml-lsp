import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { HelmTemplateExecutor } from '@/services/helmTemplateExecutor';
import { SymbolMappingIndex } from '@/services/symbolMappingIndex';

const SAMPLE_CHART_DIR = path.resolve(__dirname, '../../../../samples/helm');

describe('SymbolMappingIndex', () => {
  let executor: HelmTemplateExecutor;
  let index: SymbolMappingIndex;

  beforeEach(() => {
    executor = new HelmTemplateExecutor();
    index = new SymbolMappingIndex(executor);
  });

  afterEach(() => {
    index.clear();
    executor.clearCache();
  });

  describe('findMapping', () => {
    it('should return null when no mapping exists', () => {
      const result = index.findMapping(SAMPLE_CHART_DIR, 'templates/workflow-basic.yaml');
      expect(result).toBeNull();
    });
  });

  describe('getOrCreateMapping', () => {
    it('should create a mapping for a valid template', async () => {
      const mapping = await index.getOrCreateMapping(
        SAMPLE_CHART_DIR,
        'templates/workflow-basic.yaml'
      );

      expect(mapping).not.toBeNull();
      expect(mapping?.chartDir).toBe(SAMPLE_CHART_DIR);
      expect(mapping?.originalRelativePath).toBe('templates/workflow-basic.yaml');
      expect(mapping?.lineMappings.length).toBeGreaterThan(0);
    });

    it('should return cached mapping on subsequent calls', async () => {
      const first = await index.getOrCreateMapping(
        SAMPLE_CHART_DIR,
        'templates/workflow-basic.yaml'
      );
      const second = await index.getOrCreateMapping(
        SAMPLE_CHART_DIR,
        'templates/workflow-basic.yaml'
      );

      expect(first).toBe(second); // 同一オブジェクト参照
    });

    it('should return null for non-existent template', async () => {
      const mapping = await index.getOrCreateMapping(
        SAMPLE_CHART_DIR,
        'templates/does-not-exist.yaml'
      );

      expect(mapping).toBeNull();
    });

    it('should return null for non-existent chart', async () => {
      const mapping = await index.getOrCreateMapping(
        '/non/existent/chart',
        'templates/workflow-basic.yaml'
      );

      expect(mapping).toBeNull();
    });
  });

  describe('findOriginalLocation', () => {
    it('should find original position for a rendered line', async () => {
      const result = await index.findOriginalLocation(
        SAMPLE_CHART_DIR,
        'templates/workflow-basic.yaml',
        0,
        0
      );

      expect(result).not.toBeNull();
      expect(result?.line).toBeGreaterThanOrEqual(0);
      expect(result?.confidence).toBeGreaterThan(0);
    });

    it('should return null for invalid template', async () => {
      const result = await index.findOriginalLocation(
        SAMPLE_CHART_DIR,
        'templates/does-not-exist.yaml',
        0,
        0
      );

      expect(result).toBeNull();
    });
  });

  describe('findOriginalHelmExpression', () => {
    it('should return null when position does not correspond to Helm expression', async () => {
      // 行0は通常 apiVersion: v1 のような静的行なのでHelm式はない
      const result = await index.findOriginalHelmExpression(
        SAMPLE_CHART_DIR,
        'templates/workflow-basic.yaml',
        0,
        0
      );

      // Helm式がない場合はnull
      expect(result).toBeNull();
    });

    it('should include confidence in result when Helm expression is found', async () => {
      // マッピングを構築し、tokenMappingsの位置を使って検索
      const mapping = await index.getOrCreateMapping(
        SAMPLE_CHART_DIR,
        'templates/workflow-basic.yaml'
      );

      if (!mapping || mapping.tokenMappings.length === 0) {
        // helm がインストールされていない場合等はスキップ
        return;
      }

      // 最初のtokenMappingの位置を使って検索
      const tm = mapping.tokenMappings[0];
      const result = await index.findOriginalHelmExpression(
        SAMPLE_CHART_DIR,
        'templates/workflow-basic.yaml',
        tm.renderedRange.start.line,
        tm.renderedRange.start.character
      );

      expect(result).not.toBeNull();
      expect(result!.confidence).toBeGreaterThanOrEqual(0);
      expect(result!.confidence).toBeLessThanOrEqual(1);
      expect(typeof result!.confidence).toBe('number');
    });
  });

  describe('invalidate', () => {
    it('should remove specific mapping', async () => {
      await index.getOrCreateMapping(SAMPLE_CHART_DIR, 'templates/workflow-basic.yaml');
      expect(index.findMapping(SAMPLE_CHART_DIR, 'templates/workflow-basic.yaml')).not.toBeNull();

      index.invalidate(SAMPLE_CHART_DIR, 'templates/workflow-basic.yaml');
      // invalidateは即座にマッピングを削除
      expect(index.findMapping(SAMPLE_CHART_DIR, 'templates/workflow-basic.yaml')).toBeNull();
    });

    it('should remove all mappings for a chart when templatePath is omitted', async () => {
      await index.getOrCreateMapping(SAMPLE_CHART_DIR, 'templates/workflow-basic.yaml');

      index.invalidate(SAMPLE_CHART_DIR);
      expect(index.findMapping(SAMPLE_CHART_DIR, 'templates/workflow-basic.yaml')).toBeNull();
    });
  });

  describe('clear', () => {
    it('should remove all mappings', async () => {
      await index.getOrCreateMapping(SAMPLE_CHART_DIR, 'templates/workflow-basic.yaml');

      index.clear();
      expect(index.findMapping(SAMPLE_CHART_DIR, 'templates/workflow-basic.yaml')).toBeNull();
    });
  });
});
