import { beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { HelmChart } from '@/features/helmChartDetection';
import { ValuesIndex } from '@/services/valuesIndex';
import { filePathToUri } from '@/utils/uriUtils';

describe('ValuesIndex', () => {
  let tempDir: string;
  let index: ValuesIndex;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'values-index-test-'));
    index = new ValuesIndex();
  });

  describe('initialize', () => {
    it('should index values from single Chart', async () => {
      // Create Chart structure
      fs.writeFileSync(
        path.join(tempDir, 'Chart.yaml'),
        'apiVersion: v2\nname: test-chart\nversion: 1.0.0'
      );
      fs.writeFileSync(path.join(tempDir, 'values.yaml'), 'replicaCount: 1\nnamespace: default');

      const chart: HelmChart = {
        name: 'test-chart',
        chartYamlUri: filePathToUri(path.join(tempDir, 'Chart.yaml')),
        valuesYamlUri: filePathToUri(path.join(tempDir, 'values.yaml')),
        templatesDir: path.join(tempDir, 'templates'),
        rootDir: tempDir,
      };

      await index.initialize([chart]);

      expect(index.size).toBe(1);
      const values = index.getAllValues('test-chart');
      expect(values.length).toBeGreaterThan(0);
    });

    it('should index values from multiple Charts', async () => {
      // Create first Chart
      const chart1Dir = path.join(tempDir, 'chart1');
      fs.mkdirSync(chart1Dir);
      fs.writeFileSync(
        path.join(chart1Dir, 'Chart.yaml'),
        'apiVersion: v2\nname: chart1\nversion: 1.0.0'
      );
      fs.writeFileSync(path.join(chart1Dir, 'values.yaml'), 'foo: bar');

      // Create second Chart
      const chart2Dir = path.join(tempDir, 'chart2');
      fs.mkdirSync(chart2Dir);
      fs.writeFileSync(
        path.join(chart2Dir, 'Chart.yaml'),
        'apiVersion: v2\nname: chart2\nversion: 1.0.0'
      );
      fs.writeFileSync(path.join(chart2Dir, 'values.yaml'), 'baz: qux');

      const charts: HelmChart[] = [
        {
          name: 'chart1',
          chartYamlUri: filePathToUri(path.join(chart1Dir, 'Chart.yaml')),
          valuesYamlUri: filePathToUri(path.join(chart1Dir, 'values.yaml')),
          templatesDir: path.join(chart1Dir, 'templates'),
          rootDir: chart1Dir,
        },
        {
          name: 'chart2',
          chartYamlUri: filePathToUri(path.join(chart2Dir, 'Chart.yaml')),
          valuesYamlUri: filePathToUri(path.join(chart2Dir, 'values.yaml')),
          templatesDir: path.join(chart2Dir, 'templates'),
          rootDir: chart2Dir,
        },
      ];

      await index.initialize(charts);

      expect(index.size).toBe(2);
      expect(index.getChartNames()).toContain('chart1');
      expect(index.getChartNames()).toContain('chart2');
    });

    it('should handle Chart with missing values.yaml', async () => {
      const chart: HelmChart = {
        name: 'test-chart',
        chartYamlUri: filePathToUri(path.join(tempDir, 'Chart.yaml')),
        valuesYamlUri: filePathToUri(path.join(tempDir, 'values.yaml')),
        templatesDir: path.join(tempDir, 'templates'),
        rootDir: tempDir,
      };

      await index.initialize([chart]);

      expect(index.size).toBe(1);
      const values = index.getAllValues('test-chart');
      expect(values).toEqual([]);
    });

    it('should clear previous index on re-initialization', async () => {
      // First initialization
      fs.writeFileSync(path.join(tempDir, 'values.yaml'), 'foo: bar');
      const chart1: HelmChart = {
        name: 'chart1',
        chartYamlUri: filePathToUri(path.join(tempDir, 'Chart.yaml')),
        valuesYamlUri: filePathToUri(path.join(tempDir, 'values.yaml')),
        templatesDir: path.join(tempDir, 'templates'),
        rootDir: tempDir,
      };

      await index.initialize([chart1]);
      expect(index.size).toBe(1);

      // Second initialization with different Chart
      const newTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'values-index-test-'));
      fs.writeFileSync(path.join(newTempDir, 'values.yaml'), 'baz: qux');
      const chart2: HelmChart = {
        name: 'chart2',
        chartYamlUri: filePathToUri(path.join(newTempDir, 'Chart.yaml')),
        valuesYamlUri: filePathToUri(path.join(newTempDir, 'values.yaml')),
        templatesDir: path.join(newTempDir, 'templates'),
        rootDir: newTempDir,
      };

      await index.initialize([chart2]);
      expect(index.size).toBe(1);
      expect(index.getChartNames()).toEqual(['chart2']);
    });
  });

  describe('findValue', () => {
    beforeEach(async () => {
      fs.writeFileSync(
        path.join(tempDir, 'values.yaml'),
        `
replicaCount: 1
image:
  repository: nginx
  tag: latest
`
      );

      const chart: HelmChart = {
        name: 'test-chart',
        chartYamlUri: filePathToUri(path.join(tempDir, 'Chart.yaml')),
        valuesYamlUri: filePathToUri(path.join(tempDir, 'values.yaml')),
        templatesDir: path.join(tempDir, 'templates'),
        rootDir: tempDir,
      };

      await index.initialize([chart]);
    });

    it('should find simple value', () => {
      const value = index.findValue('test-chart', 'replicaCount');

      expect(value).toBeDefined();
      expect(value?.value).toBe(1);
      expect(value?.valueType).toBe('number');
    });

    it('should find nested value', () => {
      const value = index.findValue('test-chart', 'image.repository');

      expect(value).toBeDefined();
      expect(value?.value).toBe('nginx');
    });

    it('should return undefined for non-existent value', () => {
      const value = index.findValue('test-chart', 'nonexistent');

      expect(value).toBeUndefined();
    });

    it('should return undefined for non-existent Chart', () => {
      const value = index.findValue('nonexistent-chart', 'replicaCount');

      expect(value).toBeUndefined();
    });
  });

  describe('findValuesByPrefix', () => {
    beforeEach(async () => {
      fs.writeFileSync(
        path.join(tempDir, 'values.yaml'),
        `
image:
  repository: nginx
  tag: latest
  pullPolicy: IfNotPresent
replicaCount: 1
`
      );

      const chart: HelmChart = {
        name: 'test-chart',
        chartYamlUri: filePathToUri(path.join(tempDir, 'Chart.yaml')),
        valuesYamlUri: filePathToUri(path.join(tempDir, 'values.yaml')),
        templatesDir: path.join(tempDir, 'templates'),
        rootDir: tempDir,
      };

      await index.initialize([chart]);
    });

    it('should find values by prefix', () => {
      const values = index.findValuesByPrefix('test-chart', 'image');

      expect(values.length).toBeGreaterThan(0);
      const paths = values.map(v => v.path);
      expect(paths).toContain('image');
      expect(paths).toContain('image.repository');
      expect(paths).toContain('image.tag');
    });

    it('should return empty array for non-matching prefix', () => {
      const values = index.findValuesByPrefix('test-chart', 'nonexistent');

      expect(values).toEqual([]);
    });

    it('should return empty array for non-existent Chart', () => {
      const values = index.findValuesByPrefix('nonexistent-chart', 'image');

      expect(values).toEqual([]);
    });
  });

  describe('updateValuesFile', () => {
    it('should update values when file changes', async () => {
      const valuesPath = path.join(tempDir, 'values.yaml');
      fs.writeFileSync(valuesPath, 'foo: bar');

      const chart: HelmChart = {
        name: 'test-chart',
        chartYamlUri: filePathToUri(path.join(tempDir, 'Chart.yaml')),
        valuesYamlUri: filePathToUri(valuesPath),
        templatesDir: path.join(tempDir, 'templates'),
        rootDir: tempDir,
      };

      await index.initialize([chart]);

      let value = index.findValue('test-chart', 'foo');
      expect(value?.value).toBe('bar');

      // Update file
      fs.writeFileSync(valuesPath, 'foo: updated');

      await index.updateValuesFile(filePathToUri(valuesPath));

      value = index.findValue('test-chart', 'foo');
      expect(value?.value).toBe('updated');
    });

    it('should handle update for non-indexed values.yaml', async () => {
      const valuesPath = path.join(tempDir, 'values.yaml');
      fs.writeFileSync(valuesPath, 'foo: bar');

      // Don't throw error
      await index.updateValuesFile(filePathToUri(valuesPath));
    });
  });

  describe('clear', () => {
    it('should remove all indexed values', async () => {
      fs.writeFileSync(path.join(tempDir, 'values.yaml'), 'foo: bar');

      const chart: HelmChart = {
        name: 'test-chart',
        chartYamlUri: filePathToUri(path.join(tempDir, 'Chart.yaml')),
        valuesYamlUri: filePathToUri(path.join(tempDir, 'values.yaml')),
        templatesDir: path.join(tempDir, 'templates'),
        rootDir: tempDir,
      };

      await index.initialize([chart]);
      expect(index.size).toBe(1);

      index.clear();

      expect(index.size).toBe(0);
      expect(index.getChartNames()).toEqual([]);
    });
  });
});
