import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { SymbolMapping } from '@/types/rendering';
import { FileCache } from '@/utils/fileCache';

describe('FileCache', () => {
  let cache: FileCache;
  let cacheDir: string;
  let tempChartDir: string;

  const testMapping: SymbolMapping = {
    chartName: 'test-chart',
    chartDir: '', // will be set in beforeEach
    originalUri: 'file:///tmp/test-chart/templates/test.yaml',
    originalRelativePath: 'templates/test.yaml',
    lineMappings: [{ renderedLine: 0, originalLine: 0, confidence: 1.0, method: 'exact' as const }],
    tokenMappings: [],
    createdAt: Date.now(),
  };

  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fileCache-test-'));
    tempChartDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chart-test-'));

    // Create minimal chart structure
    fs.mkdirSync(path.join(tempChartDir, 'templates'), { recursive: true });
    fs.writeFileSync(path.join(tempChartDir, 'templates', 'test.yaml'), 'apiVersion: v1\n');
    fs.writeFileSync(path.join(tempChartDir, 'values.yaml'), 'key: value\n');
    fs.writeFileSync(path.join(tempChartDir, 'Chart.yaml'), 'name: test-chart\n');

    testMapping.chartDir = tempChartDir;
    cache = new FileCache(cacheDir);
  });

  afterEach(() => {
    fs.rmSync(cacheDir, { recursive: true, force: true });
    fs.rmSync(tempChartDir, { recursive: true, force: true });
  });

  it('should save and load mapping', async () => {
    await cache.save(tempChartDir, 'templates/test.yaml', testMapping);
    const loaded = await cache.load(tempChartDir, 'templates/test.yaml');

    expect(loaded).not.toBeNull();
    expect(loaded!.chartName).toBe('test-chart');
    expect(loaded!.lineMappings).toHaveLength(1);
    expect(loaded!.lineMappings[0].confidence).toBe(1.0);
  });

  it('should return null for non-existent cache', async () => {
    const loaded = await cache.load('/non/existent', 'templates/test.yaml');
    expect(loaded).toBeNull();
  });

  it('should invalidate specific entry', async () => {
    await cache.save(tempChartDir, 'templates/test.yaml', testMapping);
    cache.invalidate(tempChartDir, 'templates/test.yaml');
    const loaded = await cache.load(tempChartDir, 'templates/test.yaml');
    expect(loaded).toBeNull();
  });

  it('should invalidate all entries for chartDir', async () => {
    // Create a second template file
    fs.writeFileSync(path.join(tempChartDir, 'templates', 'other.yaml'), 'apiVersion: v1\n');

    const mapping2 = { ...testMapping, originalRelativePath: 'templates/other.yaml' };

    await cache.save(tempChartDir, 'templates/test.yaml', testMapping);
    await cache.save(tempChartDir, 'templates/other.yaml', mapping2);

    cache.invalidate(tempChartDir);

    const loaded1 = await cache.load(tempChartDir, 'templates/test.yaml');
    const loaded2 = await cache.load(tempChartDir, 'templates/other.yaml');
    expect(loaded1).toBeNull();
    expect(loaded2).toBeNull();
  });

  it('should return null when checksums do not match', async () => {
    await cache.save(tempChartDir, 'templates/test.yaml', testMapping);

    // Modify source file to change mtime
    const templateFile = path.join(tempChartDir, 'templates', 'test.yaml');
    // Wait a small amount to ensure mtime changes
    await new Promise(resolve => setTimeout(resolve, 50));
    fs.writeFileSync(templateFile, 'apiVersion: v2\nkind: Deployment\n');

    const loaded = await cache.load(tempChartDir, 'templates/test.yaml');
    expect(loaded).toBeNull();
  });

  it('should handle clear', async () => {
    await cache.save(tempChartDir, 'templates/test.yaml', testMapping);
    cache.clear();
    const loaded = await cache.load(tempChartDir, 'templates/test.yaml');
    expect(loaded).toBeNull();
  });
});
