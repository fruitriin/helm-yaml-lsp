/**
 * Argo Workflows LSP - Helm Chart Index Test
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { HelmChartIndex } from '../../src/services/helmChartIndex';
import { filePathToUri } from '../../src/utils/uriUtils';

describe('HelmChartIndex', () => {
  let testDir: string;
  let helmChartIndex: HelmChartIndex;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `lsp-test-helm-index-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    helmChartIndex = new HelmChartIndex();
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    helmChartIndex.clear();
  });

  describe('initialize', () => {
    it('should initialize with empty workspace', async () => {
      helmChartIndex.setWorkspaceFolders([testDir]);
      await helmChartIndex.initialize();

      expect(helmChartIndex.isInitialized()).toBe(true);
      expect(helmChartIndex.getAllCharts().length).toBe(0);
    });

    it('should find and index a single Helm Chart', async () => {
      const chartDir = path.join(testDir, 'my-chart');
      await fs.mkdir(chartDir, { recursive: true });
      await fs.writeFile(
        path.join(chartDir, 'Chart.yaml'),
        'apiVersion: v2\nname: my-chart\nversion: 1.0.0\n'
      );

      helmChartIndex.setWorkspaceFolders([testDir]);
      await helmChartIndex.initialize();

      const charts = helmChartIndex.getAllCharts();
      expect(charts.length).toBe(1);
      expect(charts[0].name).toBe('my-chart');
    });

    it('should find and index multiple Helm Charts', async () => {
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

      helmChartIndex.setWorkspaceFolders([testDir]);
      await helmChartIndex.initialize();

      const charts = helmChartIndex.getAllCharts();
      expect(charts.length).toBe(2);
      expect(charts.map(c => c.name).sort()).toEqual(['chart1', 'chart2']);
    });

    it('should only initialize once', async () => {
      helmChartIndex.setWorkspaceFolders([testDir]);
      await helmChartIndex.initialize();
      await helmChartIndex.initialize(); // 2回目

      expect(helmChartIndex.isInitialized()).toBe(true);
    });

    it('should index Charts with values.yaml and templates/', async () => {
      const chartDir = path.join(testDir, 'full-chart');
      await fs.mkdir(chartDir, { recursive: true });
      await fs.writeFile(
        path.join(chartDir, 'Chart.yaml'),
        'apiVersion: v2\nname: full-chart\nversion: 1.0.0\n'
      );
      await fs.writeFile(path.join(chartDir, 'values.yaml'), 'key: value\n');
      await fs.mkdir(path.join(chartDir, 'templates'), { recursive: true });

      helmChartIndex.setWorkspaceFolders([testDir]);
      await helmChartIndex.initialize();

      const charts = helmChartIndex.getAllCharts();
      expect(charts.length).toBe(1);
      expect(charts[0].valuesYamlUri).toBeDefined();
      expect(charts[0].templatesDir).toBeDefined();
    });
  });

  describe('findChartForFile', () => {
    beforeEach(async () => {
      const chartDir = path.join(testDir, 'my-chart');
      await fs.mkdir(chartDir, { recursive: true });
      await fs.writeFile(
        path.join(chartDir, 'Chart.yaml'),
        'apiVersion: v2\nname: my-chart\nversion: 1.0.0\n'
      );
      await fs.mkdir(path.join(chartDir, 'templates'), { recursive: true });

      helmChartIndex.setWorkspaceFolders([testDir]);
      await helmChartIndex.initialize();
    });

    it('should find Chart for file in templates/', () => {
      const fileUri = filePathToUri(path.join(testDir, 'my-chart', 'templates', 'workflow.yaml'));
      const chart = helmChartIndex.findChartForFile(fileUri);

      expect(chart).toBeDefined();
      expect(chart?.name).toBe('my-chart');
    });

    it('should find Chart for Chart.yaml itself', () => {
      const fileUri = filePathToUri(path.join(testDir, 'my-chart', 'Chart.yaml'));
      const chart = helmChartIndex.findChartForFile(fileUri);

      expect(chart).toBeDefined();
      expect(chart?.name).toBe('my-chart');
    });

    it('should find Chart for values.yaml', () => {
      const fileUri = filePathToUri(path.join(testDir, 'my-chart', 'values.yaml'));
      const chart = helmChartIndex.findChartForFile(fileUri);

      expect(chart).toBeDefined();
      expect(chart?.name).toBe('my-chart');
    });

    it('should return undefined for file outside any Chart', () => {
      const fileUri = filePathToUri(path.join(testDir, 'other-dir', 'file.yaml'));
      const chart = helmChartIndex.findChartForFile(fileUri);

      expect(chart).toBeUndefined();
    });

    it('should find correct Chart when multiple Charts exist', async () => {
      const chart2Dir = path.join(testDir, 'chart2');
      await fs.mkdir(chart2Dir, { recursive: true });
      await fs.writeFile(
        path.join(chart2Dir, 'Chart.yaml'),
        'apiVersion: v2\nname: chart2\nversion: 1.0.0\n'
      );

      // 再初期化
      helmChartIndex.clear();
      helmChartIndex.setWorkspaceFolders([testDir]);
      await helmChartIndex.initialize();

      const file1Uri = filePathToUri(path.join(testDir, 'my-chart', 'templates', 'workflow.yaml'));
      const file2Uri = filePathToUri(path.join(testDir, 'chart2', 'templates', 'workflow.yaml'));

      const chart1 = helmChartIndex.findChartForFile(file1Uri);
      const chart2 = helmChartIndex.findChartForFile(file2Uri);

      expect(chart1?.name).toBe('my-chart');
      expect(chart2?.name).toBe('chart2');
    });
  });

  describe('getAllCharts', () => {
    it('should return empty array if no Charts found', async () => {
      helmChartIndex.setWorkspaceFolders([testDir]);
      await helmChartIndex.initialize();

      const charts = helmChartIndex.getAllCharts();
      expect(charts).toEqual([]);
    });

    it('should return all indexed Charts', async () => {
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

      helmChartIndex.setWorkspaceFolders([testDir]);
      await helmChartIndex.initialize();

      const charts = helmChartIndex.getAllCharts();
      expect(charts.length).toBe(2);
    });

    it('should return a copy of the charts array', async () => {
      helmChartIndex.setWorkspaceFolders([testDir]);
      await helmChartIndex.initialize();

      const charts1 = helmChartIndex.getAllCharts();
      const charts2 = helmChartIndex.getAllCharts();

      expect(charts1).not.toBe(charts2); // 別の配列インスタンス
      expect(charts1).toEqual(charts2); // 内容は同じ
    });
  });

  describe('updateChart', () => {
    it('should add a new Chart', async () => {
      helmChartIndex.setWorkspaceFolders([testDir]);
      await helmChartIndex.initialize();

      expect(helmChartIndex.getAllCharts().length).toBe(0);

      // 新しいChartを作成
      const chartDir = path.join(testDir, 'new-chart');
      await fs.mkdir(chartDir, { recursive: true });
      await fs.writeFile(
        path.join(chartDir, 'Chart.yaml'),
        'apiVersion: v2\nname: new-chart\nversion: 1.0.0\n'
      );

      await helmChartIndex.updateChart(chartDir);

      const charts = helmChartIndex.getAllCharts();
      expect(charts.length).toBe(1);
      expect(charts[0].name).toBe('new-chart');
    });

    it('should update an existing Chart', async () => {
      const chartDir = path.join(testDir, 'my-chart');
      await fs.mkdir(chartDir, { recursive: true });
      await fs.writeFile(
        path.join(chartDir, 'Chart.yaml'),
        'apiVersion: v2\nname: my-chart\nversion: 1.0.0\n'
      );

      helmChartIndex.setWorkspaceFolders([testDir]);
      await helmChartIndex.initialize();

      expect(helmChartIndex.getAllCharts()[0].metadata?.version).toBe('1.0.0');

      // Chart.yamlを更新
      await fs.writeFile(
        path.join(chartDir, 'Chart.yaml'),
        'apiVersion: v2\nname: my-chart\nversion: 2.0.0\n'
      );

      await helmChartIndex.updateChart(chartDir);

      const charts = helmChartIndex.getAllCharts();
      expect(charts.length).toBe(1);
      expect(charts[0].metadata?.version).toBe('2.0.0');
    });

    it('should remove Chart if Chart.yaml is deleted', async () => {
      const chartDir = path.join(testDir, 'my-chart');
      await fs.mkdir(chartDir, { recursive: true });
      await fs.writeFile(
        path.join(chartDir, 'Chart.yaml'),
        'apiVersion: v2\nname: my-chart\nversion: 1.0.0\n'
      );

      helmChartIndex.setWorkspaceFolders([testDir]);
      await helmChartIndex.initialize();

      expect(helmChartIndex.getAllCharts().length).toBe(1);

      // Chart.yamlを削除
      await fs.rm(path.join(chartDir, 'Chart.yaml'));

      await helmChartIndex.updateChart(chartDir);

      expect(helmChartIndex.getAllCharts().length).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all Charts', async () => {
      const chartDir = path.join(testDir, 'my-chart');
      await fs.mkdir(chartDir, { recursive: true });
      await fs.writeFile(
        path.join(chartDir, 'Chart.yaml'),
        'apiVersion: v2\nname: my-chart\nversion: 1.0.0\n'
      );

      helmChartIndex.setWorkspaceFolders([testDir]);
      await helmChartIndex.initialize();

      expect(helmChartIndex.getAllCharts().length).toBe(1);

      helmChartIndex.clear();

      expect(helmChartIndex.getAllCharts().length).toBe(0);
      expect(helmChartIndex.isInitialized()).toBe(false);
    });
  });
});
