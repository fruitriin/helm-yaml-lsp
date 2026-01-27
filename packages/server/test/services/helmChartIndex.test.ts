import { beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { filePathToUri } from '@/utils/uriUtils';
import { HelmChartIndex } from '@/services/helmChartIndex';
import type { HelmChart } from '@/features/helmChartDetection';

describe('HelmChartIndex', () => {
	let tempDir: string;
	let index: HelmChartIndex;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-index-test-'));
		index = new HelmChartIndex();
	});

	describe('initialize', () => {
		it('should discover and index Helm Charts', async () => {
			// Create Chart structure
			fs.writeFileSync(
				path.join(tempDir, 'Chart.yaml'),
				'apiVersion: v2\nname: test-chart\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(tempDir, 'values.yaml'), 'foo: bar');

			await index.initialize([filePathToUri(tempDir)]);

			expect(index.size).toBe(1);
			const charts = index.getAllCharts();
			expect(charts[0].name).toBe('test-chart');
		});

		it('should handle multiple workspace folders', async () => {
			// Create first workspace with Chart
			const workspace1 = path.join(tempDir, 'workspace1');
			fs.mkdirSync(workspace1);
			fs.writeFileSync(
				path.join(workspace1, 'Chart.yaml'),
				'apiVersion: v2\nname: chart1\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(workspace1, 'values.yaml'), 'foo: bar');

			// Create second workspace with Chart
			const workspace2 = path.join(tempDir, 'workspace2');
			fs.mkdirSync(workspace2);
			fs.writeFileSync(
				path.join(workspace2, 'Chart.yaml'),
				'apiVersion: v2\nname: chart2\nversion: 1.0.0',
			);
			fs.mkdirSync(path.join(workspace2, 'templates'));

			await index.initialize([
				filePathToUri(workspace1),
				filePathToUri(workspace2),
			]);

			expect(index.size).toBe(2);
		});

		it('should clear previous Charts on re-initialization', async () => {
			// First initialization
			const chart1Dir = path.join(tempDir, 'chart1');
			fs.mkdirSync(chart1Dir);
			fs.writeFileSync(
				path.join(chart1Dir, 'Chart.yaml'),
				'apiVersion: v2\nname: chart1\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(chart1Dir, 'values.yaml'), 'foo: bar');

			await index.initialize([filePathToUri(tempDir)]);
			expect(index.size).toBe(1);

			// Second initialization with different Chart
			const newTempDir = fs.mkdtempSync(
				path.join(os.tmpdir(), 'helm-index-test-'),
			);
			const chart2Dir = path.join(newTempDir, 'chart2');
			fs.mkdirSync(chart2Dir);
			fs.writeFileSync(
				path.join(chart2Dir, 'Chart.yaml'),
				'apiVersion: v2\nname: chart2\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(chart2Dir, 'values.yaml'), 'foo: bar');

			await index.initialize([filePathToUri(newTempDir)]);
			expect(index.size).toBe(1);
			expect(index.getAllCharts()[0].name).toBe('chart2');
		});

		it('should handle workspace with no Charts', async () => {
			await index.initialize([filePathToUri(tempDir)]);

			expect(index.size).toBe(0);
		});
	});

	describe('findChartForFile', () => {
		beforeEach(async () => {
			// Create Chart structure
			fs.writeFileSync(
				path.join(tempDir, 'Chart.yaml'),
				'apiVersion: v2\nname: test-chart\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(tempDir, 'values.yaml'), 'foo: bar');
			fs.mkdirSync(path.join(tempDir, 'templates'));

			await index.initialize([filePathToUri(tempDir)]);
		});

		it('should find Chart for file in templates/', () => {
			const templateFile = path.join(tempDir, 'templates', 'deployment.yaml');
			fs.writeFileSync(templateFile, 'apiVersion: apps/v1');

			const chart = index.findChartForFile(filePathToUri(templateFile));

			expect(chart).toBeDefined();
			expect(chart?.name).toBe('test-chart');
		});

		it('should find Chart for values.yaml', () => {
			const valuesFile = path.join(tempDir, 'values.yaml');

			const chart = index.findChartForFile(filePathToUri(valuesFile));

			expect(chart).toBeDefined();
			expect(chart?.name).toBe('test-chart');
		});

		it('should find Chart for Chart.yaml', () => {
			const chartFile = path.join(tempDir, 'Chart.yaml');

			const chart = index.findChartForFile(filePathToUri(chartFile));

			expect(chart).toBeDefined();
			expect(chart?.name).toBe('test-chart');
		});

		it('should return undefined for file outside Chart', () => {
			const outsideFile = path.join(os.tmpdir(), 'outside.yaml');
			fs.writeFileSync(outsideFile, 'foo: bar');

			const chart = index.findChartForFile(filePathToUri(outsideFile));

			expect(chart).toBeUndefined();
		});

		it('should handle nested template files', () => {
			const nestedDir = path.join(tempDir, 'templates', 'subdir');
			fs.mkdirSync(nestedDir);
			const nestedFile = path.join(nestedDir, 'service.yaml');
			fs.writeFileSync(nestedFile, 'apiVersion: v1');

			const chart = index.findChartForFile(filePathToUri(nestedFile));

			expect(chart).toBeDefined();
			expect(chart?.name).toBe('test-chart');
		});
	});

	describe('getChart', () => {
		it('should return Chart by root directory', async () => {
			fs.writeFileSync(
				path.join(tempDir, 'Chart.yaml'),
				'apiVersion: v2\nname: test-chart\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(tempDir, 'values.yaml'), 'foo: bar');

			await index.initialize([filePathToUri(tempDir)]);

			const chart = index.getChart(tempDir);

			expect(chart).toBeDefined();
			expect(chart?.name).toBe('test-chart');
		});

		it('should return undefined for non-existent Chart', async () => {
			await index.initialize([filePathToUri(tempDir)]);

			const chart = index.getChart('/nonexistent/path');

			expect(chart).toBeUndefined();
		});
	});

	describe('updateChart', () => {
		it('should update Chart metadata', async () => {
			fs.writeFileSync(
				path.join(tempDir, 'Chart.yaml'),
				'apiVersion: v2\nname: old-name\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(tempDir, 'values.yaml'), 'foo: bar');

			await index.initialize([filePathToUri(tempDir)]);

			// Update Chart.yaml
			fs.writeFileSync(
				path.join(tempDir, 'Chart.yaml'),
				'apiVersion: v2\nname: new-name\nversion: 2.0.0',
			);

			const result = await index.updateChart(tempDir);

			expect(result).toBe(true);
			const chart = index.getChart(tempDir);
			expect(chart?.name).toBe('new-name');
		});

		it('should return false when Chart not found', async () => {
			const result = await index.updateChart('/nonexistent/path');

			expect(result).toBe(false);
		});

		it('should return false when Chart.yaml is invalid', async () => {
			fs.writeFileSync(
				path.join(tempDir, 'Chart.yaml'),
				'apiVersion: v2\nname: test-chart\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(tempDir, 'values.yaml'), 'foo: bar');

			await index.initialize([filePathToUri(tempDir)]);

			// Make Chart.yaml invalid
			fs.writeFileSync(path.join(tempDir, 'Chart.yaml'), 'invalid: yaml:');

			const result = await index.updateChart(tempDir);

			expect(result).toBe(false);
		});
	});

	describe('addChart', () => {
		it('should add a new Chart to the index', () => {
			const chart: HelmChart = {
				name: 'new-chart',
				chartYamlUri: filePathToUri(path.join(tempDir, 'Chart.yaml')),
				valuesYamlUri: filePathToUri(path.join(tempDir, 'values.yaml')),
				templatesDir: path.join(tempDir, 'templates'),
				rootDir: tempDir,
			};

			index.addChart(chart);

			expect(index.size).toBe(1);
			expect(index.getChart(tempDir)).toEqual(chart);
		});
	});

	describe('removeChart', () => {
		it('should remove a Chart from the index', async () => {
			fs.writeFileSync(
				path.join(tempDir, 'Chart.yaml'),
				'apiVersion: v2\nname: test-chart\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(tempDir, 'values.yaml'), 'foo: bar');

			await index.initialize([filePathToUri(tempDir)]);
			expect(index.size).toBe(1);

			const result = index.removeChart(tempDir);

			expect(result).toBe(true);
			expect(index.size).toBe(0);
		});

		it('should return false when Chart not found', () => {
			const result = index.removeChart('/nonexistent/path');

			expect(result).toBe(false);
		});
	});

	describe('clear', () => {
		it('should remove all Charts from the index', async () => {
			// Create two Charts
			const chart1Dir = path.join(tempDir, 'chart1');
			fs.mkdirSync(chart1Dir);
			fs.writeFileSync(
				path.join(chart1Dir, 'Chart.yaml'),
				'apiVersion: v2\nname: chart1\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(chart1Dir, 'values.yaml'), 'foo: bar');

			const chart2Dir = path.join(tempDir, 'chart2');
			fs.mkdirSync(chart2Dir);
			fs.writeFileSync(
				path.join(chart2Dir, 'Chart.yaml'),
				'apiVersion: v2\nname: chart2\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(chart2Dir, 'values.yaml'), 'foo: bar');

			await index.initialize([filePathToUri(tempDir)]);
			expect(index.size).toBe(2);

			index.clear();

			expect(index.size).toBe(0);
		});
	});
});
