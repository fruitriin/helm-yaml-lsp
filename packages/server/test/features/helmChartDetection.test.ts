/**
 * Argo Workflows LSP - Helm Chart Detection Test
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  findHelmCharts,
  isFileInChart,
  isHelmChart,
  parseChartYaml,
} from '../../src/features/helmChartDetection';
import { filePathToUri } from '../../src/utils/uriUtils';

describe('helmChartDetection', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `lsp-test-helm-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('isHelmChart', () => {
    it('should return true if Chart.yaml exists', async () => {
      const chartDir = path.join(testDir, 'my-chart');
      await fs.mkdir(chartDir, { recursive: true });
      await fs.writeFile(
        path.join(chartDir, 'Chart.yaml'),
        'apiVersion: v2\nname: test\nversion: 1.0.0\n'
      );

      const result = await isHelmChart(chartDir);
      expect(result).toBe(true);
    });

    it('should return false if Chart.yaml does not exist', async () => {
      const result = await isHelmChart(testDir);
      expect(result).toBe(false);
    });

    it('should return false if directory does not exist', async () => {
      const result = await isHelmChart(path.join(testDir, 'non-existent'));
      expect(result).toBe(false);
    });
  });

  describe('parseChartYaml', () => {
    it('should parse valid Chart.yaml', () => {
      const content = `apiVersion: v2
name: my-chart
version: 1.0.0
description: Test chart
type: application
appVersion: "1.0"
`;
      const metadata = parseChartYaml(content);
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('my-chart');
      expect(metadata?.version).toBe('1.0.0');
      expect(metadata?.description).toBe('Test chart');
      expect(metadata?.apiVersion).toBe('v2');
      expect(metadata?.type).toBe('application');
      expect(metadata?.appVersion).toBe('1.0');
    });

    it('should handle quoted values', () => {
      const content = `apiVersion: "v2"
name: "my-chart"
version: '1.0.0'
`;
      const metadata = parseChartYaml(content);
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('my-chart');
      expect(metadata?.version).toBe('1.0.0');
      expect(metadata?.apiVersion).toBe('v2');
    });

    it('should skip comment lines', () => {
      const content = `# This is a comment
apiVersion: v2
# Another comment
name: my-chart
version: 1.0.0
`;
      const metadata = parseChartYaml(content);
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('my-chart');
    });

    it('should skip Helm template syntax lines', () => {
      const content = `apiVersion: v2
name: {{ .Values.chartName }}
version: 1.0.0
`;
      const metadata = parseChartYaml(content);
      // name に Helm 構文が含まれているため、name がパースされない
      // 必須フィールドが揃わないので undefined が返る
      expect(metadata).toBeUndefined();
    });

    it('should return undefined if required fields are missing', () => {
      const content = `apiVersion: v2
description: Missing name and version
`;
      const metadata = parseChartYaml(content);
      expect(metadata).toBeUndefined();
    });

    it('should return undefined for invalid YAML', () => {
      const content = 'invalid: : yaml: content';
      const metadata = parseChartYaml(content);
      expect(metadata).toBeUndefined();
    });
  });

  describe('findHelmCharts', () => {
    it('should find a single Helm Chart', async () => {
      const chartDir = path.join(testDir, 'my-chart');
      await fs.mkdir(chartDir, { recursive: true });
      await fs.writeFile(
        path.join(chartDir, 'Chart.yaml'),
        'apiVersion: v2\nname: my-chart\nversion: 1.0.0\n'
      );
      await fs.writeFile(path.join(chartDir, 'values.yaml'), 'key: value\n');
      await fs.mkdir(path.join(chartDir, 'templates'), { recursive: true });

      const charts = await findHelmCharts([testDir]);
      expect(charts.length).toBe(1);
      expect(charts[0].name).toBe('my-chart');
      expect(charts[0].rootDir).toBe(chartDir);
      expect(charts[0].valuesYamlUri).toBeDefined();
      expect(charts[0].templatesDir).toBeDefined();
    });

    it('should find multiple Helm Charts', async () => {
      const chart1Dir = path.join(testDir, 'chart1');
      const chart2Dir = path.join(testDir, 'chart2');

      await fs.mkdir(chart1Dir, { recursive: true });
      await fs.writeFile(
        path.join(chart1Dir, 'Chart.yaml'),
        'apiVersion: v2\nname: chart1\nversion: 1.0.0\n'
      );

      await fs.mkdir(chart2Dir, { recursive: true });
      await fs.writeFile(
        path.join(chart2Dir, 'Chart.yaml'),
        'apiVersion: v2\nname: chart2\nversion: 2.0.0\n'
      );

      const charts = await findHelmCharts([testDir]);
      expect(charts.length).toBe(2);
      expect(charts.map(c => c.name).sort()).toEqual(['chart1', 'chart2']);
    });

    it('should handle Charts without values.yaml or templates/', async () => {
      const chartDir = path.join(testDir, 'minimal-chart');
      await fs.mkdir(chartDir, { recursive: true });
      await fs.writeFile(
        path.join(chartDir, 'Chart.yaml'),
        'apiVersion: v2\nname: minimal-chart\nversion: 1.0.0\n'
      );

      const charts = await findHelmCharts([testDir]);
      expect(charts.length).toBe(1);
      expect(charts[0].name).toBe('minimal-chart');
      expect(charts[0].valuesYamlUri).toBeUndefined();
      expect(charts[0].templatesDir).toBeUndefined();
    });

    it('should skip directories without valid Chart.yaml', async () => {
      const invalidChartDir = path.join(testDir, 'invalid-chart');
      await fs.mkdir(invalidChartDir, { recursive: true });
      await fs.writeFile(path.join(invalidChartDir, 'Chart.yaml'), 'invalid yaml content\n');

      const charts = await findHelmCharts([testDir]);
      expect(charts.length).toBe(0);
    });

    it('should handle nested Chart structures', async () => {
      const parentChartDir = path.join(testDir, 'parent-chart');
      const subChartDir = path.join(parentChartDir, 'charts', 'sub-chart');

      await fs.mkdir(parentChartDir, { recursive: true });
      await fs.writeFile(
        path.join(parentChartDir, 'Chart.yaml'),
        'apiVersion: v2\nname: parent-chart\nversion: 1.0.0\n'
      );

      await fs.mkdir(subChartDir, { recursive: true });
      await fs.writeFile(
        path.join(subChartDir, 'Chart.yaml'),
        'apiVersion: v2\nname: sub-chart\nversion: 1.0.0\n'
      );

      const charts = await findHelmCharts([testDir]);
      expect(charts.length).toBe(2);
      expect(charts.map(c => c.name).sort()).toEqual(['parent-chart', 'sub-chart']);
    });
  });

  describe('isFileInChart', () => {
    it('should return true if file is in Chart directory', () => {
      const chart = {
        name: 'my-chart',
        chartYamlUri: filePathToUri('/workspace/my-chart/Chart.yaml'),
        rootDir: '/workspace/my-chart',
        metadata: {
          name: 'my-chart',
          version: '1.0.0',
          apiVersion: 'v2',
        },
      };

      const fileUri = filePathToUri('/workspace/my-chart/templates/workflow.yaml');
      expect(isFileInChart(fileUri, chart)).toBe(true);
    });

    it('should return false if file is outside Chart directory', () => {
      const chart = {
        name: 'my-chart',
        chartYamlUri: filePathToUri('/workspace/my-chart/Chart.yaml'),
        rootDir: '/workspace/my-chart',
        metadata: {
          name: 'my-chart',
          version: '1.0.0',
          apiVersion: 'v2',
        },
      };

      const fileUri = filePathToUri('/workspace/other-chart/templates/workflow.yaml');
      expect(isFileInChart(fileUri, chart)).toBe(false);
    });

    it('should handle Chart.yaml itself', () => {
      const chart = {
        name: 'my-chart',
        chartYamlUri: filePathToUri('/workspace/my-chart/Chart.yaml'),
        rootDir: '/workspace/my-chart',
        metadata: {
          name: 'my-chart',
          version: '1.0.0',
          apiVersion: 'v2',
        },
      };

      expect(isFileInChart(chart.chartYamlUri, chart)).toBe(true);
    });
  });
});
